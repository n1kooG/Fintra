"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { HOLDING_KINDS } from "@/lib/investments";
import {
  isUnitMethod,
  parsePrice,
  parseUnits,
  priceToDb,
  unitsHeldAt,
  unitsToDb,
  unitsValueMinor,
  PRICE_SCALE,
  UNITS_SCALE,
  type ValuationMethod,
} from "@/lib/holding-value";
import { CRYPTO_VS_CURRENCIES, cryptoAsset } from "@/lib/crypto";
import { divRound, parseRate } from "@/lib/fx";
import { CURRENCIES, CURRENCY_CONFIG, toMinorUnits, type Currency } from "@/lib/money";
import { QUOTED_CURRENCIES } from "@/lib/mindicador";
import { todayISO } from "@/lib/dates";
import { rateToFreeze } from "@/server/fx/rates";
import { refreshCryptoPrices } from "@/server/prices/crypto";
import type { ActionState } from "./accounts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const uuid = z.string().uuid();

const positive = (label: string) =>
  z.coerce
    .number()
    .positive(`${label} tiene que ser mayor a cero.`)
    .max(1_000_000_000_000, `${label} es demasiado grande.`);

const descriptiveFields = {
  name: z
    .string()
    .trim()
    .min(1, "Ponle un nombre al instrumento.")
    .max(80, "El nombre es muy largo."),
  institution: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(200).optional(),
};

const ratePeriodSchema = z.enum(["monthly", "annual"], {
  message: "Elige si la tasa es mensual o anual.",
});
const ratePercentSchema = z.coerce
  .number()
  .min(0, "La tasa no puede ser negativa.")
  .max(1000, "La tasa es demasiado alta.");

function revalidateInvestmentViews() {
  revalidatePath("/inversiones");
  revalidatePath("/dashboard");
  revalidatePath("/cuentas");
  revalidatePath("/calendario");
}

/** Texto del formulario como decimal escalado positivo (unidades o precio). */
function positiveScaled(
  raw: FormDataEntryValue | null,
  parse: (v: string) => bigint | null,
  label: string,
): { value: bigint } | { error: string } {
  const value = parse(String(raw ?? ""));
  if (value === null || value <= 0n)
    return { error: `${label} tiene que ser mayor a cero.` };
  if (value > 10n ** 24n) return { error: `${label} es demasiado grande.` };
  return { value };
}

type HoldingInfo = {
  currency: Currency;
  method: ValuationMethod;
  assetCode: string | null;
  termStart: string | null;
};

/** El instrumento si es de este household (la FK sola no lo garantiza). */
async function loadHolding(
  householdId: string,
  holdingId: string,
): Promise<HoldingInfo | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("holdings")
    .select("currency, valuation_method, asset_code, term_start")
    .eq("id", holdingId)
    .eq("household_id", householdId)
    .single();
  if (!data) return null;
  return {
    currency: data.currency as Currency,
    method: data.valuation_method as ValuationMethod,
    assetCode: data.asset_code,
    termStart: data.term_start,
  };
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

const baseCreate = z.object({
  ...descriptiveFields,
  openedOn: isoDate,
});

const METHODS = ["manual", "fixed_term", "fx", "crypto", "priced"] as const;

/**
 * Crea un instrumento con su aporte inicial. Segun `method`:
 *  manual      kind + monto invertido (+ valor actual opcional)
 *  fixed_term  capital, vencimiento y tasa: el interes se calcula solo
 *  fx          unidades de USD/EUR/UF/UTM: se valoriza con la cotizacion del dia
 *  crypto      unidades de una criptomoneda: precio de mercado diario
 *  priced      unidades (cuotas de un fondo, acciones) con precio escrito a mano
 * Si algo falla a medio camino se borra el instrumento para no dejar uno a medias.
 */
export async function createHolding(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const method = z.enum(METHODS).safeParse(formData.get("method") || "manual");
  if (!method.success) return { error: "Elige cómo se valoriza el instrumento." };

  const base = baseCreate.safeParse({
    name: formData.get("name"),
    institution: formData.get("institution") || undefined,
    notes: formData.get("notes") || undefined,
    openedOn: formData.get("openedOn") || todayISO(),
  });
  if (!base.success) {
    return {
      error: base.error.issues[0]?.message ?? "Revisa los datos del instrumento.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  // Datos propios de cada metodo -> fila del instrumento + primer aporte.
  let holdingRow: Record<string, unknown>;
  let investedMinor: bigint;
  let firstUnits: bigint | null = null;
  let initialValuation: { valueMinor: bigint; unitPrice?: bigint } | null = null;

  if (method.data === "manual") {
    const parsed = z
      .object({
        kind: z.enum(HOLDING_KINDS),
        currency: z.enum(CURRENCIES),
        invested: positive("El monto invertido"),
        currentValue: z.coerce
          .number()
          .min(0, "El valor actual no puede ser negativo.")
          .max(1_000_000_000_000, "El valor actual es demasiado grande.")
          .optional(),
      })
      .safeParse({
        kind: formData.get("kind"),
        currency: formData.get("currency"),
        invested: formData.get("invested"),
        currentValue: formData.get("currentValue") || undefined,
      });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Revisa los datos del instrumento.",
      };
    }
    investedMinor = toMinorUnits(parsed.data.invested, parsed.data.currency);
    if (investedMinor <= 0n) return { error: "El monto invertido es demasiado pequeño." };
    if (parsed.data.currentValue !== undefined) {
      initialValuation = {
        valueMinor: toMinorUnits(parsed.data.currentValue, parsed.data.currency),
      };
    }
    holdingRow = { kind: parsed.data.kind, currency: parsed.data.currency };
  } else if (method.data === "fixed_term") {
    const parsed = z
      .object({
        currency: z.enum(CURRENCIES),
        invested: positive("El capital"),
        termEnd: isoDate,
        ratePercent: ratePercentSchema,
        ratePeriod: ratePeriodSchema,
      })
      .safeParse({
        currency: formData.get("currency") || "CLP",
        invested: formData.get("invested"),
        termEnd: formData.get("termEnd"),
        ratePercent: formData.get("ratePercent"),
        ratePeriod: formData.get("ratePeriod"),
      });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Revisa los datos del depósito.",
      };
    }
    if (parsed.data.termEnd <= base.data.openedOn) {
      return { error: "El vencimiento tiene que ser posterior a la fecha de inicio." };
    }
    investedMinor = toMinorUnits(parsed.data.invested, parsed.data.currency);
    if (investedMinor <= 0n) return { error: "El capital es demasiado pequeño." };
    holdingRow = {
      kind: "fixed_term_deposit",
      currency: parsed.data.currency,
      term_start: base.data.openedOn,
      term_end: parsed.data.termEnd,
      rate_percent: parsed.data.ratePercent.toFixed(4),
      rate_period: parsed.data.ratePeriod,
    };
  } else {
    // fx / crypto / priced: unidades.
    const units = positiveScaled(formData.get("units"), parseUnits, "Las unidades");
    if ("error" in units) return { error: units.error };
    firstUnits = units.value;

    const costRaw = formData.get("cost");
    const hasCost = costRaw !== null && String(costRaw).trim() !== "";

    if (method.data === "fx") {
      const asset = z
        .enum(QUOTED_CURRENCIES as [string, ...string[]])
        .safeParse(formData.get("asset"));
      if (!asset.success) return { error: "Elige la moneda (dólar, euro, UF...)." };
      holdingRow = {
        kind: "foreign_currency",
        currency: "CLP",
        asset_code: asset.data,
      };
      if (hasCost) {
        const cost = positive("El costo").safeParse(costRaw);
        if (!cost.success) return { error: cost.error.issues[0].message };
        investedMinor = toMinorUnits(cost.data, "CLP");
      } else {
        // Sin costo, vale lo que costaba esa moneda el dia de la compra.
        const frozen = await rateToFreeze(
          supabase,
          asset.data as Currency,
          base.data.openedOn,
        );
        const rate = parseRate(frozen);
        if (!rate) {
          return {
            error: `No hay cotización de ${asset.data} para esa fecha. Escribe cuánto pagaste en pesos.`,
          };
        }
        investedMinor = unitsValueMinor(units.value, rate, "CLP");
      }
    } else if (method.data === "crypto") {
      const asset = cryptoAsset(String(formData.get("asset") ?? ""));
      if (!asset) return { error: "Elige la criptomoneda." };
      const currency = z
        .enum(CRYPTO_VS_CURRENCIES)
        .safeParse(formData.get("currency") || "CLP");
      if (!currency.success) return { error: "La moneda debe ser CLP o USD." };
      if (!hasCost) return { error: "Escribe cuánto pagaste." };
      const cost = positive("El costo").safeParse(costRaw);
      if (!cost.success) return { error: cost.error.issues[0].message };
      holdingRow = { kind: "crypto", currency: currency.data, asset_code: asset.code };
      investedMinor = toMinorUnits(cost.data, currency.data);
    } else {
      const parsed = z
        .object({
          kind: z.enum(["mutual_fund", "stock", "other"]),
          currency: z.enum(CURRENCIES),
        })
        .safeParse({
          kind: formData.get("kind") || "mutual_fund",
          currency: formData.get("currency") || "CLP",
        });
      if (!parsed.success) return { error: "Revisa el tipo y la moneda." };
      if (!hasCost) return { error: "Escribe cuánto pagaste en total." };
      const cost = positive("El costo").safeParse(costRaw);
      if (!cost.success) return { error: cost.error.issues[0].message };
      holdingRow = { kind: parsed.data.kind, currency: parsed.data.currency };
      investedMinor = toMinorUnits(cost.data, parsed.data.currency);

      // Precio inicial: el indicado, o el de compra (costo / unidades).
      const priceRaw = formData.get("unitPrice");
      let price: bigint | null = null;
      if (priceRaw !== null && String(priceRaw).trim() !== "") {
        const given = positiveScaled(priceRaw, parsePrice, "El precio por unidad");
        if ("error" in given) return { error: given.error };
        price = given.value;
      } else {
        const minor = 10n ** BigInt(CURRENCY_CONFIG[parsed.data.currency].minorUnits);
        price = divRound(investedMinor * UNITS_SCALE * PRICE_SCALE, units.value * minor);
      }
      if (price > 0n) {
        initialValuation = {
          valueMinor: unitsValueMinor(units.value, price, parsed.data.currency),
          unitPrice: price,
        };
      }
    }
    if (investedMinor <= 0n) return { error: "El costo es demasiado pequeño." };
  }

  const { data: holding, error } = await supabase
    .from("holdings")
    .insert({
      household_id: householdId,
      name: base.data.name,
      institution: base.data.institution ?? null,
      notes: base.data.notes ?? null,
      valuation_method: method.data,
      ...holdingRow,
    })
    .select("id, currency")
    .single();
  if (error || !holding) {
    return { error: "No pudimos crear el instrumento. Intenta de nuevo." };
  }

  const { error: flowError } = await supabase.from("holding_flows").insert({
    household_id: householdId,
    holding_id: holding.id,
    occurred_on: base.data.openedOn,
    amount_minor: investedMinor.toString(),
    units: firstUnits === null ? null : unitsToDb(firstUnits),
  });

  let valuationError = null;
  if (!flowError && initialValuation) {
    const isPricePoint = initialValuation.unitPrice !== undefined;
    ({ error: valuationError } = await supabase.from("holding_valuations").insert({
      household_id: householdId,
      holding_id: holding.id,
      // El precio de compra rige desde el dia de la compra; un valor total a mano, desde hoy.
      valued_on: isPricePoint ? base.data.openedOn : todayISO(),
      value_minor: initialValuation.valueMinor.toString(),
      unit_price: isPricePoint ? priceToDb(initialValuation.unitPrice!) : null,
      source: "manual",
    }));
  }

  if (flowError || valuationError) {
    await supabase.from("holdings").delete().eq("id", holding.id);
    return { error: "No pudimos guardar el instrumento. Intenta de nuevo." };
  }

  // Una cripto recien creada muestra su precio de mercado desde el primer momento.
  if (method.data === "crypto") await refreshCryptoPrices(supabase, householdId);

  revalidateInvestmentViews();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Editar, archivar, borrar
// ---------------------------------------------------------------------------

const updateSchema = z.object(descriptiveFields);

/** Edita nombre, institucion y nota; en un deposito a plazo, tambien vencimiento y tasa. El tipo y la moneda no cambian. */
export async function updateHolding(
  holdingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(holdingId).success) return { error: "Instrumento inválido." };
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    institution: formData.get("institution") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos del instrumento.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const info = await loadHolding(householdId, holdingId);
  if (!info) return { error: "No encontramos el instrumento." };

  const patch: Record<string, unknown> = {
    name: parsed.data.name,
    institution: parsed.data.institution ?? null,
    notes: parsed.data.notes ?? null,
  };

  if (info.method === "fixed_term" && formData.has("termEnd")) {
    const terms = z
      .object({
        termEnd: isoDate,
        ratePercent: ratePercentSchema,
        ratePeriod: ratePeriodSchema,
      })
      .safeParse({
        termEnd: formData.get("termEnd"),
        ratePercent: formData.get("ratePercent"),
        ratePeriod: formData.get("ratePeriod"),
      });
    if (!terms.success) {
      return {
        error: terms.error.issues[0]?.message ?? "Revisa las condiciones del depósito.",
      };
    }
    if (info.termStart && terms.data.termEnd <= info.termStart) {
      return { error: "El vencimiento tiene que ser posterior a la fecha de inicio." };
    }
    patch.term_end = terms.data.termEnd;
    patch.rate_percent = terms.data.ratePercent.toFixed(4);
    patch.rate_period = terms.data.ratePeriod;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("holdings")
    .update(patch)
    .eq("id", holdingId)
    .eq("household_id", householdId);
  if (error) {
    // Incluye la restriccion que exige vencimiento posterior al inicio en depositos.
    return {
      error: "No pudimos guardar los cambios. Revisa las fechas e intenta de nuevo.",
    };
  }

  revalidateInvestmentViews();
  return { error: null };
}

/** Archiva un instrumento cerrado (o lo reabre): deja de sumar al patrimonio, pero conserva su historia. */
export async function setHoldingArchived(holdingId: string, archived: boolean) {
  if (!uuid.safeParse(holdingId).success) throw new Error("Instrumento inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("holdings")
    .update({ archived })
    .eq("id", holdingId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos actualizar el instrumento.");

  revalidateInvestmentViews();
}

/** Elimina el instrumento con todos sus aportes y valorizaciones. */
export async function deleteHolding(holdingId: string) {
  if (!uuid.safeParse(holdingId).success) throw new Error("Instrumento inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("holdings")
    .delete()
    .eq("id", holdingId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el instrumento.");

  revalidateInvestmentViews();
}

// ---------------------------------------------------------------------------
// Aportes y retiros
// ---------------------------------------------------------------------------

const flowSchema = z.object({
  direction: z.enum(["contribution", "withdrawal"]),
  occurredOn: isoDate,
  notes: z.string().trim().max(200).optional(),
});

/**
 * Registra un aporte (suma capital) o un retiro (saca capital). En los
 * instrumentos por unidades hay que indicar cuantas unidades se compran o
 * venden; el monto es opcional en dolares/divisas (se calcula con la
 * cotizacion de la fecha) y obligatorio en el resto.
 */
export async function addHoldingFlow(
  holdingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(holdingId).success) return { error: "Instrumento inválido." };
  const parsed = flowSchema.safeParse({
    direction: formData.get("direction"),
    occurredOn: formData.get("occurredOn") || todayISO(),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos del movimiento.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const info = await loadHolding(householdId, holdingId);
  if (!info) return { error: "No encontramos el instrumento." };
  const sign = parsed.data.direction === "withdrawal" ? -1n : 1n;
  const supabase = await createClient();

  let units: bigint | null = null;
  let unitsMagnitude = 0n;
  if (isUnitMethod(info.method)) {
    const entered = positiveScaled(formData.get("units"), parseUnits, "Las unidades");
    if ("error" in entered) return { error: entered.error };
    units = sign * entered.value;
    unitsMagnitude = entered.value;

    // No se pueden vender mas unidades de las que se tienen a esa fecha.
    if (sign < 0n) {
      const { data: existing } = await supabase
        .from("holding_flows")
        .select("occurred_on, units")
        .eq("holding_id", holdingId)
        .eq("household_id", householdId);
      const held = unitsHeldAt(
        (existing ?? []).map((f: { occurred_on: string; units: string | null }) => ({
          occurredOn: f.occurred_on,
          amountMinor: 0n,
          units: parseUnits(f.units),
        })),
        parsed.data.occurredOn,
      );
      if (entered.value > held) {
        return { error: "No puedes vender más unidades de las que tenías en esa fecha." };
      }
    }
  }

  const amountRaw = formData.get("amount");
  const hasAmount = amountRaw !== null && String(amountRaw).trim() !== "";
  let magnitude: bigint;
  if (hasAmount) {
    const amount = positive("El monto").safeParse(amountRaw);
    if (!amount.success) return { error: amount.error.issues[0].message };
    magnitude = toMinorUnits(amount.data, info.currency);
  } else if (info.method === "fx" && info.assetCode && units !== null) {
    const rate = parseRate(
      await rateToFreeze(supabase, info.assetCode as Currency, parsed.data.occurredOn),
    );
    if (!rate) {
      return {
        error: `No hay cotización de ${info.assetCode} para esa fecha. Escribe el monto.`,
      };
    }
    magnitude = unitsValueMinor(unitsMagnitude, rate, info.currency);
  } else {
    return { error: "Escribe el monto." };
  }
  if (magnitude <= 0n) return { error: "El monto es demasiado pequeño." };

  const { error } = await supabase.from("holding_flows").insert({
    household_id: householdId,
    holding_id: holdingId,
    occurred_on: parsed.data.occurredOn,
    amount_minor: (sign * magnitude).toString(),
    units: units === null ? null : unitsToDb(units),
    notes: parsed.data.notes ?? null,
  });
  if (error) return { error: "No pudimos registrar el movimiento. Intenta de nuevo." };

  if (info.method === "crypto") await refreshCryptoPrices(supabase, householdId);

  revalidateInvestmentViews();
  return { error: null };
}

export async function deleteHoldingFlow(flowId: string) {
  if (!uuid.safeParse(flowId).success) throw new Error("Movimiento inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("holding_flows")
    .delete()
    .eq("id", flowId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el movimiento.");

  revalidateInvestmentViews();
}

// ---------------------------------------------------------------------------
// Valorizacion manual y precios
// ---------------------------------------------------------------------------

const valuationSchema = z.object({
  value: z.coerce
    .number()
    .min(0, "El valor no puede ser negativo.")
    .max(1_000_000_000_000, "El valor es demasiado grande."),
  valuedOn: isoDate,
});

/** Guarda cuanto vale el instrumento en una fecha (metodo manual); si ya habia una valorizacion ese dia, la reemplaza. */
export async function setHoldingValuation(
  holdingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(holdingId).success) return { error: "Instrumento inválido." };
  const parsed = valuationSchema.safeParse({
    value: formData.get("value"),
    valuedOn: formData.get("valuedOn") || todayISO(),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos de la valorización.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const info = await loadHolding(householdId, holdingId);
  if (!info) return { error: "No encontramos el instrumento." };
  if (info.method !== "manual") {
    return { error: "Este instrumento se valoriza solo: no necesita un valor a mano." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("holding_valuations").upsert(
    {
      household_id: householdId,
      holding_id: holdingId,
      valued_on: parsed.data.valuedOn,
      value_minor: toMinorUnits(parsed.data.value, info.currency).toString(),
      source: "manual",
    },
    { onConflict: "holding_id,valued_on" },
  );
  if (error) return { error: "No pudimos guardar la valorización. Intenta de nuevo." };

  revalidateInvestmentViews();
  return { error: null };
}

/** Precio por unidad en una fecha (instrumentos "por cuotas": fondos, acciones). */
export async function setHoldingPrice(
  holdingId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(holdingId).success) return { error: "Instrumento inválido." };
  const price = positiveScaled(formData.get("unitPrice"), parsePrice, "El precio");
  if ("error" in price) return { error: price.error };
  const valuedOn = isoDate.safeParse(formData.get("valuedOn") || todayISO());
  if (!valuedOn.success) return { error: "Fecha inválida." };

  const { householdId } = await requireCurrentHousehold();
  const info = await loadHolding(householdId, holdingId);
  if (!info) return { error: "No encontramos el instrumento." };
  if (info.method !== "priced") {
    return { error: "Este instrumento no se valoriza por precio escrito a mano." };
  }

  const supabase = await createClient();
  const { data: flows } = await supabase
    .from("holding_flows")
    .select("occurred_on, units")
    .eq("holding_id", holdingId)
    .eq("household_id", householdId);
  const held = unitsHeldAt(
    (flows ?? []).map((f: { occurred_on: string; units: string | null }) => ({
      occurredOn: f.occurred_on,
      amountMinor: 0n,
      units: parseUnits(f.units),
    })),
    valuedOn.data,
  );

  const { error } = await supabase.from("holding_valuations").upsert(
    {
      household_id: householdId,
      holding_id: holdingId,
      valued_on: valuedOn.data,
      value_minor: unitsValueMinor(
        held > 0n ? held : 0n,
        price.value,
        info.currency,
      ).toString(),
      unit_price: priceToDb(price.value),
      source: "manual",
    },
    { onConflict: "holding_id,valued_on" },
  );
  if (error) return { error: "No pudimos guardar el precio. Intenta de nuevo." };

  revalidateInvestmentViews();
  return { error: null };
}

/** Botón «actualizar precios»: trae ahora los precios de mercado de tus criptomonedas. */
export async function refreshPricesNow(): Promise<{
  updated: number;
  error: string | null;
}> {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const result = await refreshCryptoPrices(supabase, householdId);
  revalidateInvestmentViews();
  return result;
}

export async function deleteHoldingValuation(valuationId: string) {
  if (!uuid.safeParse(valuationId).success) throw new Error("Valorización inválida.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("holding_valuations")
    .delete()
    .eq("id", valuationId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la valorización.");

  revalidateInvestmentViews();
}
