"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { checkParent, type CategoryLike } from "@/lib/categories";
import type { ActionState } from "./accounts";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Escribe un nombre para la categoría.")
  .max(60);
const idSchema = z.string().uuid();

/** "" o ausente = categoría principal; si no, el id de la principal elegida. */
function readParentId(formData: FormData): string | null | "invalid" {
  const raw = formData.get("parentId");
  if (raw === null || raw === "" || raw === "none") return null;
  return idSchema.safeParse(raw).success ? String(raw) : "invalid";
}

function revalidateCategoryViews() {
  revalidatePath("/configuracion");
  revalidatePath("/movimientos");
  revalidatePath("/movimientos/nuevo");
  revalidatePath("/presupuestos");
}

export async function createCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ name: nameSchema, kind: z.enum(["income", "expense"]) })
    .safeParse({ name: formData.get("name"), kind: formData.get("kind") });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos de la categoría.",
    };
  }
  const parentId = readParentId(formData);
  if (parentId === "invalid") return { error: "Categoría principal inválida." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  if (parentId) {
    const { data: all } = await supabase
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("household_id", householdId);
    const problem = checkParent(
      (all ?? []) as CategoryLike[],
      null,
      parentId,
      parsed.data.kind,
    );
    if (problem) return { error: problem };
  }

  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    parent_id: parentId,
    name: parsed.data.name,
    kind: parsed.data.kind,
  });

  if (error) return { error: "No pudimos crear la categoría. Inténtalo de nuevo." };

  revalidateCategoryViews();
  return { error: null };
}

/** Renombra una categoría y/o la mueve bajo otra principal (o la deja como principal). */
export async function updateCategory(
  categoryId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!idSchema.safeParse(categoryId).success) return { error: "Categoría inválida." };
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const parentId = readParentId(formData);
  if (parentId === "invalid") return { error: "Categoría principal inválida." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: all } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id")
    .eq("household_id", householdId);
  const categories = (all ?? []) as CategoryLike[];
  const current = categories.find((c) => c.id === categoryId);
  if (!current) return { error: "No encontramos la categoría." };

  // Solo valida el padre cuando cambia: renombrar nunca debe fallar por la jerarquía.
  if (parentId !== current.parent_id) {
    const problem = checkParent(categories, categoryId, parentId, current.kind);
    if (problem) return { error: problem };
  }

  const { error } = await supabase
    .from("categories")
    .update({ name: name.data, parent_id: parentId })
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) return { error: "No pudimos guardar la categoría." };

  revalidateCategoryViews();
  return { error: null };
}

export async function deleteCategory(categoryId: string) {
  if (!idSchema.safeParse(categoryId).success) throw new Error("Categoría inválida.");
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  // Los movimientos que usaban esta categoria quedan sin categoria
  // (categoryId es nullable, on delete set null en el esquema), y sus
  // subcategorias pasan a ser principales (parent_id tambien es set null).
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error("No pudimos eliminar la categoría.");

  revalidateCategoryViews();
}
