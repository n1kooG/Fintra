import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { categoryLabels, type CategoryLike } from "@/lib/categories";
import type { CategoryRow } from "@/lib/supabase/types";

export async function getCategories(householdId: string): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", householdId)
    .order("kind", { ascending: false }) // expense antes que income, como en el diseno
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Categorias minimas (id, nombre, tipo, padre) del hogar, para rotular y agrupar. */
export async function getCategoryTree(
  householdId: string,
  client?: SupabaseClient,
): Promise<CategoryLike[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id, sort_order")
    .eq("household_id", householdId);
  if (error) throw error;
  return (data ?? []) as CategoryLike[];
}

/** id -> "Padre › Hija" para todas las categorias del hogar. */
export async function getCategoryLabelMap(
  householdId: string,
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  return categoryLabels(await getCategoryTree(householdId, client));
}
