"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { DISPLAY_CURRENCIES, toMinorUnits } from "@/lib/money";
import { monthBounds, shiftMonth } from "@/lib/dates";
import type { ActionState } from "./accounts";

const budgetSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido."),
  categoryId: z.string().uuid("Elige una categoría."),
  amount: z.coerce
    .number()
    .positive("El monto tiene que ser mayor a cero.")
    .max(1_000_000_000_000, "El monto es demasiado grande."),
  currency: z.enum(DISPLAY_CURRENCIES),
});

function revalidateBudgetViews() {
  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
}

/**
 * Crea el presupuesto de una categoria para un mes, o reemplaza el monto
 * si ya existia (hay uno solo por categoria y mes).
 */
export async function saveBudget(
  monthKey: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = budgetSchema.safeParse({
    monthKey,
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
  });
  const rollover = formData.get("rollover") === "on";
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos del presupuesto.",
    };
  }

  const amountMinor = toMinorUnits(parsed.data.amount, parsed.data.currency);
  if (amountMinor <= 0n) return { error: "El monto es demasiado pequeño." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, kind")
    .eq("id", parsed.data.categoryId)
    .eq("household_id", householdId)
    .single();
  if (!category || category.kind !== "expense") {
    return { error: "Elige una categoría de gasto." };
  }

  const { error } = await supabase.from("budgets").upsert(
    {
      household_id: householdId,
      category_id: category.id,
      month: monthBounds(parsed.data.monthKey).from,
      amount_minor: amountMinor.toString(),
      currency: parsed.data.currency,
      rollover,
    },
    { onConflict: "household_id,category_id,month" },
  );
  if (error) return { error: "No pudimos guardar el presupuesto. Intenta de nuevo." };

  revalidateBudgetViews();
  return { error: null };
}

export async function deleteBudget(budgetId: string) {
  if (!z.string().uuid().safeParse(budgetId).success)
    throw new Error("Presupuesto inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el presupuesto.");

  revalidateBudgetViews();
}

/**
 * Copia los presupuestos del mes anterior al mes indicado. Solo agrega
 * las categorias que todavia no tienen presupuesto en el mes: no pisa
 * montos que ya se definieron.
 */
export async function copyBudgetsFromPreviousMonth(
  monthKey: string,
): Promise<{ copied: number; error: string | null }> {
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .safeParse(monthKey);
  if (!month.success) return { copied: 0, error: "Mes inválido." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("budgets")
    .select("category_id, amount_minor, currency, rollover")
    .eq("household_id", householdId)
    .eq("month", monthBounds(shiftMonth(month.data, -1)).from);
  if (sourceError) return { copied: 0, error: "No pudimos leer el mes anterior." };
  if (!source || source.length === 0) {
    return { copied: 0, error: "El mes anterior no tiene presupuestos para copiar." };
  }

  const target = monthBounds(month.data).from;
  const { data: inserted, error } = await supabase
    .from("budgets")
    .upsert(
      source.map((row) => ({
        household_id: householdId,
        category_id: row.category_id,
        month: target,
        amount_minor: row.amount_minor,
        currency: row.currency,
        rollover: row.rollover,
      })),
      { onConflict: "household_id,category_id,month", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { copied: 0, error: "No pudimos copiar los presupuestos." };

  // El tope total del mes anterior tambien pasa (si este mes aun no tiene uno).
  const { data: previousTotal } = await supabase
    .from("budget_totals")
    .select("amount_minor, currency")
    .eq("household_id", householdId)
    .eq("month", monthBounds(shiftMonth(month.data, -1)).from)
    .maybeSingle();
  if (previousTotal) {
    await supabase.from("budget_totals").upsert(
      {
        household_id: householdId,
        month: target,
        amount_minor: previousTotal.amount_minor,
        currency: previousTotal.currency,
      },
      { onConflict: "household_id,month", ignoreDuplicates: true },
    );
  }

  revalidateBudgetViews();
  return { copied: inserted?.length ?? 0, error: null };
}

const totalSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido."),
  amount: z.coerce
    .number()
    .positive("El tope tiene que ser mayor a cero.")
    .max(1_000_000_000_000, "El tope es demasiado grande."),
  currency: z.enum(DISPLAY_CURRENCIES),
});

/**
 * Define (o reemplaza) el tope TOTAL de gasto del mes: un solo limite para todo
 * lo que gastas, tengas o no presupuesto por categoria.
 */
export async function saveTotalBudget(
  monthKey: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = totalSchema.safeParse({
    monthKey,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el tope del mes." };
  }
  const amountMinor = toMinorUnits(parsed.data.amount, parsed.data.currency);
  if (amountMinor <= 0n) return { error: "El tope es demasiado pequeño." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("budget_totals").upsert(
    {
      household_id: householdId,
      month: monthBounds(parsed.data.monthKey).from,
      amount_minor: amountMinor.toString(),
      currency: parsed.data.currency,
    },
    { onConflict: "household_id,month" },
  );
  if (error) return { error: "No pudimos guardar el tope. Intenta de nuevo." };

  revalidateBudgetViews();
  return { error: null };
}

export async function deleteTotalBudget(totalId: string) {
  if (!z.string().uuid().safeParse(totalId).success) throw new Error("Tope inválido.");
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_totals")
    .delete()
    .eq("id", totalId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos quitar el tope.");

  revalidateBudgetViews();
}
