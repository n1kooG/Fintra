"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { CURRENCIES, toMinorUnits } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import type { ActionState } from "./accounts";

const debtSchema = z.object({
  person: z
    .string()
    .trim()
    .min(1, "Indica con quién es la deuda.")
    .max(60, "El nombre es muy largo."),
  direction: z.enum(["lent", "borrowed"]),
  amount: z.coerce
    .number()
    .positive("El monto tiene que ser mayor a cero.")
    .max(1_000_000_000_000, "El monto es demasiado grande."),
  currency: z.enum(CURRENCIES),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  notes: z.string().trim().max(200).optional(),
});

const uuid = z.string().uuid();

function revalidateDebtViews() {
  revalidatePath("/tarjetas");
}

export async function createPersonalDebt(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = debtSchema.safeParse({
    person: formData.get("person"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    occurredOn: formData.get("occurredOn") || todayISO(),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la deuda." };
  }

  const amountMinor = toMinorUnits(parsed.data.amount, parsed.data.currency);
  if (amountMinor <= 0n) return { error: "El monto es demasiado pequeño." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("personal_debts").insert({
    household_id: householdId,
    person: parsed.data.person,
    direction: parsed.data.direction,
    amount_minor: amountMinor.toString(),
    currency: parsed.data.currency,
    occurred_on: parsed.data.occurredOn,
    notes: parsed.data.notes ?? null,
  });
  if (error) return { error: "No pudimos guardar la deuda. Intenta de nuevo." };

  revalidateDebtViews();
  return { error: null };
}

/** Marca la deuda como saldada hoy, o la reabre. */
export async function setPersonalDebtSettled(debtId: string, settled: boolean) {
  if (!uuid.safeParse(debtId).success) throw new Error("Deuda inválida.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_debts")
    .update({ settled_on: settled ? todayISO() : null })
    .eq("id", debtId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos actualizar la deuda.");

  revalidateDebtViews();
}

export async function deletePersonalDebt(debtId: string) {
  if (!uuid.safeParse(debtId).success) throw new Error("Deuda inválida.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_debts")
    .delete()
    .eq("id", debtId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la deuda.");

  revalidateDebtViews();
}
