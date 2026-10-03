"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { cleanTagName, tagKey } from "@/lib/tags";
import type { ActionState } from "./accounts";

const idSchema = z.string().uuid();

function revalidateTagViews() {
  revalidatePath("/configuracion");
  revalidatePath("/movimientos");
}

/** Cambia el nombre de una etiqueta (no puede chocar con otra existente). */
export async function renameTag(
  tagId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!idSchema.safeParse(tagId).success) return { error: "Etiqueta inválida." };
  const name = cleanTagName(String(formData.get("name") ?? ""));
  if (!name) return { error: "Escribe un nombre para la etiqueta." };

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: others } = await supabase
    .from("tags")
    .select("id, name")
    .eq("household_id", householdId)
    .neq("id", tagId);
  if ((others ?? []).some((t: { name: string }) => tagKey(t.name) === tagKey(name))) {
    return { error: "Ya tienes una etiqueta con ese nombre." };
  }

  const { error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", tagId)
    .eq("household_id", householdId);
  if (error) return { error: "No pudimos renombrar la etiqueta." };

  revalidateTagViews();
  return { error: null };
}

/** Borra la etiqueta; los movimientos quedan, solo pierden esa marca (cascada). */
export async function deleteTag(tagId: string) {
  if (!idSchema.safeParse(tagId).success) throw new Error("Etiqueta inválida.");
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar la etiqueta.");

  revalidateTagViews();
}
