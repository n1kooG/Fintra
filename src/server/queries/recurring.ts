import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDays, occurrencesBetween } from "@/lib/recurrence";
import { todayISO } from "@/lib/dates";
import type { RecurringRuleRow } from "@/lib/supabase/types";

export type RecurringRuleWithRelations = RecurringRuleRow & {
  account: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
};

export async function getRecurringRules(
  householdId: string,
  client?: SupabaseClient,
): Promise<RecurringRuleWithRelations[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*, account:accounts(id, name), category:categories(id, name)")
    .eq("household_id", householdId)
    .order("active", { ascending: false })
    .order("next_run_on", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RecurringRuleWithRelations[];
}

export type UpcomingOccurrence = { date: string; rule: RecurringRuleWithRelations };

/**
 * Proximos vencimientos derivados de las reglas activas, de manana a
 * `days` dias. Lo de hoy o antes ya quedo generado como movimiento real.
 */
export function upcomingOccurrences(
  rules: RecurringRuleWithRelations[],
  days: number,
  today: string = todayISO(),
): UpcomingOccurrence[] {
  const until = addDays(today, days);
  const result: UpcomingOccurrence[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const from = rule.next_run_on > today ? rule.next_run_on : addDays(today, 1);
    const dates = occurrencesBetween(
      { startDate: rule.start_date, frequency: rule.frequency, endDate: rule.end_date },
      from,
      until,
    );
    for (const date of dates) result.push({ date, rule });
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
