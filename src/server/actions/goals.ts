"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { CURRENCIES, toMinorUnits, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import type { ActionState } from "./accounts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

const amountField = z.coerce
  .number()
  .positive("El monto tiene que ser mayor a cero.")
  .max(1_000_000_000_000, "El monto es demasiado grande.");

const goalFields = {
  name: z
    .string()
    .trim()
    .min(1, "Ponle un nombre a la meta.")
    .max(80, "El nombre es muy largo."),
  target: amountField,
  targetDate: isoDate.optional(),
};

const createSchema = z.object({ ...goalFields, currency: z.enum(CURRENCIES) });
const updateSchema = z.object(goalFields);

const contributionSchema = z.object({
  amount: amountField,
  occurredOn: isoDate,
  notes: z.string().trim().max(200).optional(),
});

const uuid = z.string().uuid();

function revalidateGoalViews() {
  revalidatePath("/metas");
}

export async function createGoal(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    target: formData.get("target"),
    currency: formData.get("currency"),
    targetDate: formData.get("targetDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la meta." };
  }

  const targetMinor = toMinorUnits(parsed.data.target, parsed.data.currency);
  if (targetMinor <= 0n) return { error: "El monto es demasiado pequeño." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("goals").insert({
    household_id: householdId,
    name: parsed.data.name,
    target_minor: targetMinor.toString(),
    currency: parsed.data.currency,
    target_date: parsed.data.targetDate ?? null,
  });
  if (error) return { error: "No pudimos crear la meta. Intenta de nuevo." };

  revalidateGoalViews();
  return { error: null };
}

/** Edita nombre, monto objetivo y fecha. La moneda no se cambia: invalidaria los aportes ya registrados. */
export async function updateGoal(
  goalId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(goalId).success) return { error: "Meta inválida." };
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    target: formData.get("target"),
    targetDate: formData.get("targetDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la meta." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: goal } = await supabase
    .from("goals")
    .select("currency")
    .eq("id", goalId)
    .eq("household_id", householdId)
    .single();
  if (!goal) return { error: "No encontramos la meta." };

  const targetMinor = toMinorUnits(parsed.data.target, goal.currency as Currency);
  if (targetMinor <= 0n) return { error: "El monto es demasiado pequeño." };

  const { error } = await supabase
    .from("goals")
    .update({
      name: parsed.data.name,
      target_minor: targetMinor.toString(),
      target_date: parsed.data.targetDate ?? null,
    })
    .eq("id", goalId)
    .eq("household_id", householdId);
  if (error) return { error: "No pudimos guardar los cambios. Intenta de nuevo." };

  revalidateGoalViews();
  return { error: null };
}

/** Elimina la meta junto con todos sus aportes. */
export async function deleteGoal(goalId: string) {
  if (!uuid.safeParse(goalId).success) throw new Error("Meta inválida.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la meta.");

  revalidateGoalViews();
}

export async function addContribution(
  goalId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(goalId).success) return { error: "Meta inválida." };
  const parsed = contributionSchema.safeParse({
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn") || todayISO(),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del aporte." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  // La meta tiene que ser de este household: la FK sola no lo garantiza.
  const { data: goal } = await supabase
    .from("goals")
    .select("id, currency")
    .eq("id", goalId)
    .eq("household_id", householdId)
    .single();
  if (!goal) return { error: "No encontramos la meta." };

  const amountMinor = toMinorUnits(parsed.data.amount, goal.currency as Currency);
  if (amountMinor <= 0n) return { error: "El monto es demasiado pequeño." };

  const { error } = await supabase.from("goal_contributions").insert({
    household_id: householdId,
    goal_id: goal.id,
    amount_minor: amountMinor.toString(),
    occurred_on: parsed.data.occurredOn,
    notes: parsed.data.notes ?? null,
  });
  if (error) return { error: "No pudimos registrar el aporte. Intenta de nuevo." };

  revalidateGoalViews();
  return { error: null };
}

export async function deleteContribution(contributionId: string) {
  if (!uuid.safeParse(contributionId).success) throw new Error("Aporte inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_contributions")
    .delete()
    .eq("id", contributionId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el aporte.");

  revalidateGoalViews();
}
