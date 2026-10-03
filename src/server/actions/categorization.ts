"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { matchRule, normalizeText } from "@/lib/categorization";
import { getCategorizationRules } from "@/server/queries/categorization";
import type { ActionState } from "./accounts";

const ruleSchema = z.object({
  pattern: z
    .string()
    .transform(normalizeText)
    .pipe(
      z
        .string()
        .min(2, "El texto tiene que tener al menos 2 letras.")
        .max(60, "El texto es demasiado largo."),
    ),
  categoryId: z.string().uuid("Elige una categoría."),
});

export async function createCategorizationRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = ruleSchema.safeParse({
    pattern: formData.get("pattern") ?? "",
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la regla." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("categorization_rules").insert({
    household_id: householdId,
    pattern: parsed.data.pattern,
    category_id: parsed.data.categoryId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Ya existe una regla para "${parsed.data.pattern}".`
          : "No pudimos crear la regla. Intenta de nuevo.",
    };
  }

  revalidatePath("/configuracion/reglas");
  revalidatePath("/movimientos/nuevo");
  return { error: null };
}

export async function deleteCategorizationRule(ruleId: string) {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la regla.");

  revalidatePath("/configuracion/reglas");
  revalidatePath("/movimientos/nuevo");
}

const PAGE_SIZE = 1000;
const UPDATE_CHUNK = 200;

/**
 * Aplica las reglas a todo el historial: cada ingreso o gasto cuyo
 * comercio coincide con una regla pasa a la categoria de esa regla
 * (aunque se hubiera elegido otra a mano — la pantalla lo advierte
 * antes). Devuelve cuantos movimientos cambiaron de categoria.
 */
export async function applyRulesToHistory(): Promise<{
  updated: number;
  error?: string;
}> {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const rules = await getCategorizationRules(householdId);
  if (rules.length === 0) return { updated: 0 };

  const changesByCategory = new Map<string, string[]>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, merchant, type, category_id")
      .eq("household_id", householdId)
      .in("type", ["income", "expense"])
      .not("merchant", "is", null)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { updated: 0, error: "No pudimos leer los movimientos." };

    for (const tx of data ?? []) {
      const rule = matchRule(tx.merchant, tx.type as "income" | "expense", rules);
      if (!rule || rule.categoryId === tx.category_id) continue;
      const ids = changesByCategory.get(rule.categoryId) ?? [];
      ids.push(tx.id);
      changesByCategory.set(rule.categoryId, ids);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  let updated = 0;
  for (const [categoryId, ids] of changesByCategory) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK);
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: categoryId, updated_at: new Date().toISOString() })
        .in("id", chunk)
        .eq("household_id", householdId);
      if (error) {
        return { updated, error: "Se aplicó solo una parte. Intenta de nuevo." };
      }
      updated += chunk.length;
    }
  }

  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  return { updated };
}
