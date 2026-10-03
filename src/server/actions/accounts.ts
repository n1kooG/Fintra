"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { toMinorUnits, CURRENCIES, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { rateToFreeze } from "@/server/fx/rates";
import { fetchAll } from "@/server/queries/paginate";
import { parseCardSettings } from "@/server/card-settings";

export type ActionState = { error: string | null };

const accountSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para la cuenta.").max(80),
  type: z.enum(["cash", "checking", "savings", "credit_card", "investment", "loan"]),
  currency: z.enum(CURRENCIES),
  institution: z.string().trim().max(80).optional(),
  initialBalance: z.coerce.number().finite().default(0),
});

function parseAccountForm(formData: FormData) {
  return accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    institution: formData.get("institution") || undefined,
    initialBalance: formData.get("initialBalance") || 0,
  });
}

export async function createAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la cuenta." };
  }

  // Ciclo y cupo solo aplican a tarjetas de credito (src/lib/cards.ts).
  let card = null;
  if (parsed.data.type === "credit_card") {
    const settings = parseCardSettings(formData, parsed.data.currency);
    if ("error" in settings) return { error: settings.error };
    card = settings.settings;
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    name: parsed.data.name,
    type: parsed.data.type,
    currency: parsed.data.currency,
    institution: parsed.data.institution ?? null,
    initial_balance_minor: toMinorUnits(
      parsed.data.initialBalance,
      parsed.data.currency,
    ).toString(),
    statement_close_day: card?.closeDay ?? null,
    payment_due_day: card?.dueDay ?? null,
    credit_limit_minor: card?.limitMinor?.toString() ?? null,
  });

  if (error) return { error: "No pudimos crear la cuenta. Inténtalo de nuevo." };

  revalidatePath("/cuentas");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  return { error: null };
}

export async function updateAccount(
  accountId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la cuenta." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  // El saldo inicial no se reedita aca a proposito: cambiarlo despues de
  // tener movimientos cargados corre el saldo actual de forma confusa.
  const { error } = await supabase
    .from("accounts")
    .update({
      name: parsed.data.name,
      type: parsed.data.type,
      institution: parsed.data.institution ?? null,
    })
    .eq("id", accountId)
    .eq("household_id", householdId);

  if (error) return { error: "No pudimos guardar los cambios. Inténtalo de nuevo." };

  revalidatePath("/cuentas");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function archiveAccount(accountId: string) {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { error } = await supabase
    .from("accounts")
    .update({ archived: true })
    .eq("id", accountId)
    .eq("household_id", householdId);

  if (error) throw new Error("No pudimos archivar la cuenta.");

  revalidatePath("/cuentas");
  revalidatePath("/dashboard");
}

const reconcileSchema = z.object({
  actual: z.coerce.number().finite("Escribe el saldo que ves en el banco."),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
});

/**
 * Concilia una cuenta con el saldo real (el del banco): si difiere del que
 * lleva la app, crea un movimiento de ajuste por la diferencia (ingreso si
 * falta, gasto si sobra) sin categoria. Calcula el saldo en el servidor, no
 * confia en el que muestre el cliente.
 */
export async function reconcileAccount(
  accountId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!z.string().uuid().safeParse(accountId).success)
    return { error: "Cuenta inválida." };
  const parsed = reconcileSchema.safeParse({
    actual: formData.get("actual"),
    occurredOn: formData.get("occurredOn") || todayISO(),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos de la conciliación.",
    };
  }

  const { householdId, userId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency, initial_balance_minor, name")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .single();
  if (!account) return { error: "No encontramos la cuenta." };
  const currency = account.currency as Currency;

  const movements = await fetchAll<{ amount_minor: string }>((from, to) =>
    supabase
      .from("transactions")
      .select("amount_minor")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .order("id")
      .range(from, to),
  );
  const current = movements.reduce(
    (sum, m) => sum + BigInt(m.amount_minor),
    BigInt(account.initial_balance_minor),
  );

  const actualMinor = toMinorUnits(parsed.data.actual, currency);
  const diff = actualMinor - current;
  if (diff === 0n) return { error: "El saldo ya coincide: no hace falta ajustar nada." };

  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: accountId,
    category_id: null,
    type: diff > 0n ? "income" : "expense",
    amount_minor: diff.toString(),
    currency,
    fx_rate: await rateToFreeze(supabase, currency, parsed.data.occurredOn),
    occurred_on: parsed.data.occurredOn,
    merchant: "Ajuste de conciliación",
    notes: "Para que el saldo coincida con el del banco.",
    created_by: userId,
  });
  if (error) return { error: "No pudimos crear el ajuste. Intenta de nuevo." };

  revalidatePath("/cuentas");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  return { error: null };
}
