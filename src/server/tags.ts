import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { cleanTagName, tagKey } from "@/lib/tags";

export type TagWithCount = { id: string; name: string; count: number };

/** Etiquetas del hogar con cuantos movimientos usa cada una, por nombre. */
export async function getTags(householdId: string): Promise<TagWithCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, transaction_tags(count)")
    .eq("household_id", householdId)
    .order("name");
  if (error) throw error;

  return (
    (data ?? []) as unknown as {
      id: string;
      name: string;
      transaction_tags: { count: number }[];
    }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    count: t.transaction_tags?.[0]?.count ?? 0,
  }));
}

/**
 * Deja las etiquetas de un movimiento exactamente como `names` (crea las que
 * no existian en el hogar, sin distinguir mayusculas ni tildes). Devuelve
 * false si algo fallo; las altas de etiquetas nuevas que ya se hicieron
 * quedan (son inofensivas: etiquetas sin uso).
 */
export async function setTransactionTags(
  supabase: SupabaseClient,
  householdId: string,
  transactionId: string,
  names: string[],
): Promise<boolean> {
  const wanted = names.map(cleanTagName).filter(Boolean);

  const { data: existing, error: readError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("household_id", householdId);
  if (readError) return false;

  const byKey = new Map<string, string>(
    (existing ?? []).map((t: { id: string; name: string }) => [tagKey(t.name), t.id]),
  );

  const missing = wanted.filter((n) => !byKey.has(tagKey(n)));
  if (missing.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ household_id: householdId, name })))
      .select("id, name");
    if (insertError) return false;
    for (const t of created ?? []) byKey.set(tagKey(t.name), t.id);
  }

  const desired = new Set(
    wanted.map((n) => byKey.get(tagKey(n))).filter(Boolean) as string[],
  );

  const { data: current, error: linksError } = await supabase
    .from("transaction_tags")
    .select("tag_id")
    .eq("transaction_id", transactionId);
  if (linksError) return false;
  const have = new Set((current ?? []).map((l: { tag_id: string }) => l.tag_id));

  const toRemove = [...have].filter((id) => !desired.has(id));
  const toAdd = [...desired].filter((id) => !have.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("transaction_tags")
      .delete()
      .eq("transaction_id", transactionId)
      .in("tag_id", toRemove);
    if (error) return false;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("transaction_tags")
      .insert(toAdd.map((tag_id) => ({ transaction_id: transactionId, tag_id })));
    if (error) return false;
  }
  return true;
}
