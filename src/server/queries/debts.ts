import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PersonalDebtRow } from "@/lib/supabase/types";

export type PersonalDebtView = {
  id: string;
  person: string;
  direction: PersonalDebtRow["direction"];
  amountMinor: bigint;
  currency: PersonalDebtRow["currency"];
  occurredOn: string;
  notes: string | null;
  settledOn: string | null;
};

/** Deudas entre personas, las abiertas primero y de la mas reciente a la mas antigua. */
export async function getPersonalDebts(householdId: string): Promise<PersonalDebtView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_debts")
    .select("*")
    .eq("household_id", householdId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as PersonalDebtRow[])
    .map((row) => ({
      id: row.id,
      person: row.person,
      direction: row.direction,
      amountMinor: BigInt(row.amount_minor),
      currency: row.currency,
      occurredOn: row.occurred_on,
      notes: row.notes,
      settledOn: row.settled_on,
    }))
    .sort((a, b) => Number(a.settledOn !== null) - Number(b.settledOn !== null));
}
