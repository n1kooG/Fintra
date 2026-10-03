"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import type { Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { parseCardSettings } from "@/server/card-settings";
import { createTransfer } from "@/server/transfers";
import type { ActionState } from "./accounts";

/**
 * Guarda el ciclo (dia de cierre y de pago) y el cupo de una tarjeta de
 * credito. Las cuotas ya agendadas conservan sus fechas: un cambio de
 * ciclo aplica a las compras nuevas.
 */
export async function updateCardSettings(
  accountId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!z.string().uuid().safeParse(accountId).success)
    return { error: "Tarjeta inválida." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, currency")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .single();
  if (!account) return { error: "No encontramos la tarjeta." };
  if (account.type !== "credit_card")
    return { error: "Esa cuenta no es una tarjeta de crédito." };

  const parsed = parseCardSettings(formData, account.currency as Currency);
  if ("error" in parsed) return { error: parsed.error };
  const { closeDay, dueDay, limitMinor } = parsed.settings;
  if (closeDay === null || dueDay === null) {
    return { error: "Indica el día de cierre y el día de pago." };
  }

  const { error } = await supabase
    .from("accounts")
    .update({
      statement_close_day: closeDay,
      payment_due_day: dueDay,
      credit_limit_minor: limitMinor === null ? null : limitMinor.toString(),
    })
    .eq("id", accountId)
    .eq("household_id", householdId);
  if (error) return { error: "No pudimos guardar los datos. Intenta de nuevo." };

  revalidatePath("/tarjetas");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  return { error: null };
}

const payCardSchema = z.object({
  fromAccountId: z.string().uuid("Elige la cuenta desde la que pagas."),
  amount: z.coerce
    .number()
    .positive("El monto tiene que ser mayor a cero.")
    .max(1_000_000_000_000, "El monto es demasiado grande."),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
});

/**
 * Registra el pago de una tarjeta como una transferencia desde una cuenta
 * propia hacia la cuenta de la tarjeta. Asi el saldo de ambas, el cupo y el
 * estado de cuenta (que pasa a pagado) quedan al dia sin un mecanismo aparte.
 */
export async function payCard(
  cardId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!z.string().uuid().safeParse(cardId).success) return { error: "Tarjeta inválida." };
  const parsed = payCardSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn") || todayISO(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del pago." };
  }

  const { householdId, userId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("accounts")
    .select("id, type, name")
    .eq("id", cardId)
    .eq("household_id", householdId)
    .single();
  if (!card || card.type !== "credit_card")
    return { error: "No encontramos la tarjeta." };

  const { data: source } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", parsed.data.fromAccountId)
    .eq("household_id", householdId)
    .single();
  if (!source) return { error: "No encontramos la cuenta de origen." };
  if (source.type === "credit_card") {
    return { error: "No se puede pagar una tarjeta con otra tarjeta." };
  }

  const created = await createTransfer(supabase, {
    householdId,
    userId,
    fromAccountId: parsed.data.fromAccountId,
    toAccountId: cardId,
    amount: parsed.data.amount,
    occurredOn: parsed.data.occurredOn,
    merchant: `Pago ${card.name}`,
  });
  if (created.error) return { error: created.error };

  revalidatePath("/tarjetas");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  revalidatePath("/cuentas");
  revalidatePath("/movimientos");
  return { error: null };
}
