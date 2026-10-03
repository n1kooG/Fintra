import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CategorizationRule } from "@/lib/categorization";
import type { CategoryKind } from "@/lib/supabase/types";

export type CategorizationRuleWithCategory = CategorizationRule & {
  categoryName: string;
};

/** Reglas del household con el nombre y el tipo de su categoria destino. */
export async function getCategorizationRules(
  householdId: string,
): Promise<CategorizationRuleWithCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("id, pattern, category_id, category:categories(name, kind)")
    .eq("household_id", householdId)
    .order("pattern", { ascending: true });
  if (error) throw error;

  return (
    (data ?? []) as unknown as {
      id: string;
      pattern: string;
      category_id: string;
      category: { name: string; kind: CategoryKind } | null;
    }[]
  )
    .filter((row) => row.category !== null)
    .map((row) => ({
      id: row.id,
      pattern: row.pattern,
      categoryId: row.category_id,
      kind: row.category!.kind,
      categoryName: row.category!.name,
    }));
}
