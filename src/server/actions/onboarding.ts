"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { newCategoryNames, SUGGESTED_CATEGORIES } from "@/lib/onboarding";
import type { ActionState } from "./accounts";

/** Agrega categorias de gasto sugeridas (solo las que todavia no existen). */
export async function addSuggestedCategories(names: string[]): Promise<ActionState> {
  // Solo se aceptan nombres del catalogo: la lista viaja desde el cliente.
  const allowed = names.filter((n) => SUGGESTED_CATEGORIES.includes(n));
  if (allowed.length === 0) return { error: null };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("categories")
    .select("name, sort_order")
    .eq("household_id", householdId)
    .eq("kind", "expense");
  if (readError) return { error: "No pudimos revisar tus categorías." };

  const fresh = newCategoryNames(
    (existing ?? []).map((c) => c.name),
    allowed,
  );
  if (fresh.length === 0) return { error: null };

  const nextOrder = Math.max(-1, ...(existing ?? []).map((c) => c.sort_order ?? 0)) + 1;
  const { error } = await supabase.from("categories").insert(
    fresh.map((name, i) => ({
      household_id: householdId,
      name,
      kind: "expense" as const,
      sort_order: nextOrder + i,
    })),
  );
  if (error) return { error: "No pudimos agregar las categorías." };

  revalidatePath("/configuracion");
  return { error: null };
}

/**
 * Marca el asistente como terminado (o saltado) y va al dashboard. La
 * marca vive en los metadatos del usuario de Supabase Auth: no necesita
 * una columna nueva y acompana a la persona en cualquier dispositivo.
 */
export async function finishOnboarding() {
  await requireCurrentHousehold();
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { onboarded: true } });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
