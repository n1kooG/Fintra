"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { toMinorUnits, type Currency } from "@/lib/money";
import { FREQUENCIES, addDays, nextOccurrenceAfter } from "@/lib/recurrence";
import { todayISO } from "@/lib/dates";
import { materializeDueRecurring } from "@/server/recurring/materialize";
import type { RecurringRuleRow } from "@/lib/supabase/types";
import type { ActionState } from "./accounts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

const editableFields = {
  accountId: z.string().uuid("Elige una cuenta."),
  categoryId: z.string().uuid("Elige una categoría."),
  amount: z.coerce.number().positive("El monto tiene que ser mayor a cero."),
  merchant: z.string().trim().max(120).optional(),
  endDate: isoDate.optional(),
};

const createSchema = z.object({
  type: z.enum(["income", "expense"]),
  frequency: z.enum(FREQUENCIES),
  startDate: isoDate,
  ...editableFields,
});

const updateSchema = z.object(editableFields);

function formValues(formData: FormData) {
  return {
    type: formData.get("type"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    merchant: formData.get("merchant") || undefined,
    endDate: formData.get("endDate") || undefined,
  };
}

function revalidateRecurringViews() {
  revalidatePath("/recurrentes");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
}

async function accountCurrency(householdId: string, accountId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .single();
  return (data?.currency as Currency | undefined) ?? null;
}

/**
 * Crea una regla recurrente. Si la fecha de inicio es pasada, las
 * ocurrencias vencidas se generan en el acto (el formulario lo avisa).
 */
export async function createRecurringRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la regla." };
  }
  const { endDate, startDate } = parsed.data;
  if (endDate && endDate < startDate) {
    return { error: "La fecha de término no puede ser anterior a la de inicio." };
  }

  const { householdId, userId } = await requireCurrentHousehold();
  const currency = await accountCurrency(householdId, parsed.data.accountId);
  if (!currency) return { error: "No encontramos la cuenta elegida." };

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_rules").insert({
    household_id: householdId,
    type: parsed.data.type,
    account_id: parsed.data.accountId,
    category_id: parsed.data.categoryId,
    amount_minor: toMinorUnits(parsed.data.amount, currency).toString(),
    currency,
    merchant: parsed.data.merchant ?? null,
    frequency: parsed.data.frequency,
    start_date: startDate,
    end_date: endDate ?? null,
    next_run_on: startDate,
    created_by: userId,
  });
  if (error) return { error: "No pudimos crear la regla. Intenta de nuevo." };

  await materializeDueRecurring(supabase, householdId);
  revalidateRecurringViews();
  return { error: null };
}

/**
 * Edita monto, cuenta, categoria, comercio y fecha de termino. La
 * frecuencia y la fecha de inicio no se editan: cambiarlas reescribiria
 * el calendario completo — para eso se elimina y se crea otra regla.
 * Los movimientos ya generados no cambian; solo los proximos.
 */
export async function updateRecurringRule(
  ruleId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la regla." };
  }

  const { householdId } = await requireCurrentHousehold();
  const currency = await accountCurrency(householdId, parsed.data.accountId);
  if (!currency) return { error: "No encontramos la cuenta elegida." };

  const supabase = await createClient();
  const { data: rule } = await supabase
    .from("recurring_rules")
    .select("start_date, next_run_on, active")
    .eq("id", ruleId)
    .eq("household_id", householdId)
    .single();
  if (!rule) return { error: "No encontramos la regla." };

  const endDate = parsed.data.endDate ?? null;
  if (endDate && endDate < rule.start_date) {
    return { error: "La fecha de término no puede ser anterior a la de inicio." };
  }

  const { error } = await supabase
    .from("recurring_rules")
    .update({
      account_id: parsed.data.accountId,
      category_id: parsed.data.categoryId,
      amount_minor: toMinorUnits(parsed.data.amount, currency).toString(),
      currency,
      merchant: parsed.data.merchant ?? null,
      end_date: endDate,
      // Una fecha de termino anterior a la proxima ocurrencia la da por terminada.
      active: rule.active && !(endDate && endDate < rule.next_run_on),
    })
    .eq("id", ruleId)
    .eq("household_id", householdId);
  if (error) return { error: "No pudimos guardar los cambios. Intenta de nuevo." };

  revalidateRecurringViews();
  return { error: null };
}

/**
 * Pausa o reanuda una regla. Al reanudar NO se generan las ocurrencias
 * que cayeron durante la pausa (para eso se pauso): la proxima fecha
 * pasa a ser la primera de hoy en adelante.
 */
export async function setRecurringRuleActive(ruleId: string, active: boolean) {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  if (!active) {
    await supabase
      .from("recurring_rules")
      .update({ active: false })
      .eq("id", ruleId)
      .eq("household_id", householdId);
  } else {
    const { data } = await supabase
      .from("recurring_rules")
      .select("*")
      .eq("id", ruleId)
      .eq("household_id", householdId)
      .single();
    const rule = data as RecurringRuleRow | null;
    if (!rule) throw new Error("No encontramos la regla.");

    const next = nextOccurrenceAfter(
      { startDate: rule.start_date, frequency: rule.frequency, endDate: rule.end_date },
      addDays(todayISO(), -1),
    );
    if (!next) throw new Error("La regla ya pasó su fecha de término.");

    await supabase
      .from("recurring_rules")
      .update({ active: true, next_run_on: next })
      .eq("id", ruleId)
      .eq("household_id", householdId);
    await materializeDueRecurring(supabase, householdId);
  }

  revalidateRecurringViews();
}

/** Elimina la regla. Los movimientos que ya genero se conservan (quedan como movimientos normales). */
export async function deleteRecurringRule(ruleId: string) {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la regla.");
  revalidateRecurringViews();
}
