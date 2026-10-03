import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertMinor, parseRate } from "@/lib/fx";
import { toMinorUnits, type Currency } from "@/lib/money";
import { rateToFreeze } from "@/server/fx/rates";

export type TransferInput = {
  householdId: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  /** Lo que sale de la cuenta de origen, en SU moneda. */
  amount: number;
  /** Solo entre monedas distintas: lo que llego al destino, en SU moneda. Vacio = cotizacion del dia. */
  receivedAmount?: number;
  occurredOn: string;
  merchant?: string;
  notes?: string;
};

/**
 * Crea una transferencia entre dos cuentas propias: dos movimientos
 * enlazados (la salida, negativa, y la entrada, positiva) mas el registro
 * que los vincula. Cada uno guarda la cotizacion de su moneda a esa fecha.
 * Entre monedas distintas, el monto recibido se calcula con la cotizacion
 * del dia salvo que se indique. Si algo falla a medio camino revierte lo ya
 * creado para no dejar una transferencia a medias.
 */
export async function createTransfer(
  supabase: SupabaseClient,
  input: TransferInput,
): Promise<{ error: string | null }> {
  const { householdId, userId, occurredOn } = input;

  if (input.fromAccountId === input.toAccountId) {
    return { error: "La cuenta de origen y destino no pueden ser la misma." };
  }

  const [{ data: fromAccount }, { data: toAccount }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", input.fromAccountId)
      .eq("household_id", householdId)
      .single(),
    supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", input.toAccountId)
      .eq("household_id", householdId)
      .single(),
  ]);
  if (!fromAccount || !toAccount)
    return { error: "No encontramos alguna de las cuentas." };

  const fromCurrency = fromAccount.currency as Currency;
  const toCurrency = toAccount.currency as Currency;

  const [fromRate, toRate] = await Promise.all([
    rateToFreeze(supabase, fromCurrency, occurredOn),
    rateToFreeze(supabase, toCurrency, occurredOn),
  ]);

  const sentMinor = toMinorUnits(input.amount, fromCurrency);
  let receivedMinor = sentMinor;
  if (fromCurrency !== toCurrency) {
    if (input.receivedAmount) {
      receivedMinor = toMinorUnits(input.receivedAmount, toCurrency);
    } else {
      const rFrom = fromCurrency === "CLP" ? null : parseRate(fromRate);
      const rTo = toCurrency === "CLP" ? null : parseRate(toRate);
      const missing =
        (fromCurrency !== "CLP" && !rFrom) || (toCurrency !== "CLP" && !rTo);
      if (missing) {
        return {
          error: `No hay cotización ${fromCurrency}/${toCurrency} para esa fecha. Ingresa el monto recibido a mano.`,
        };
      }
      receivedMinor = convertMinor(sentMinor, fromCurrency, toCurrency, rFrom, rTo);
    }
  }

  const merchant = input.merchant || "Transferencia entre cuentas propias";

  const { data: fromTx, error: fromError } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      account_id: fromAccount.id,
      category_id: null,
      type: "transfer",
      amount_minor: (-sentMinor).toString(),
      currency: fromCurrency,
      fx_rate: fromRate,
      occurred_on: occurredOn,
      merchant,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (fromError || !fromTx) return { error: "No pudimos registrar la transferencia." };

  const { data: toTx, error: toError } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      account_id: toAccount.id,
      category_id: null,
      type: "transfer",
      amount_minor: receivedMinor.toString(),
      currency: toCurrency,
      fx_rate: toRate,
      occurred_on: occurredOn,
      merchant,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (toError || !toTx) {
    // Revierte la pierna que ya se creo para no dejar una transferencia a medias.
    await supabase.from("transactions").delete().eq("id", fromTx.id);
    return { error: "No pudimos registrar la transferencia." };
  }

  const { error: linkError } = await supabase.from("transfers").insert({
    household_id: householdId,
    from_transaction_id: fromTx.id,
    to_transaction_id: toTx.id,
  });
  if (linkError) {
    await supabase.from("transactions").delete().in("id", [fromTx.id, toTx.id]);
    return { error: "No pudimos vincular la transferencia." };
  }

  return { error: null };
}
