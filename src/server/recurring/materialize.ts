import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dueOccurrences } from "@/lib/recurrence";
import { todayISO } from "@/lib/dates";
import { rateToFreeze } from "@/server/fx/rates";
import type { RecurringRuleRow } from "@/lib/supabase/types";

/**
 * Genera los movimientos vencidos de las reglas recurrentes de un
 * household y avanza la proxima fecha de cada regla. Devuelve cuantos
 * movimientos nuevos quedaron creados.
 *
 * Se llama desde dos lugares, y es seguro que coincidan: al abrir la
 * app (con el cliente del usuario, bajo RLS) y desde el cron diario
 * (con el cliente admin). La restriccion unica (regla, fecha) en
 * transactions hace que el segundo insert de una misma ocurrencia se
 * ignore en vez de duplicarla.
 */
export async function materializeDueRecurring(
  supabase: SupabaseClient,
  householdId: string,
  today: string = todayISO(),
): Promise<number> {
  const { data: rules, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("household_id", householdId)
    .eq("active", true)
    .lte("next_run_on", today);
  if (error) throw error;

  let created = 0;
  for (const rule of (rules ?? []) as RecurringRuleRow[]) {
    const { dates, nextRunOn } = dueOccurrences(
      {
        startDate: rule.start_date,
        frequency: rule.frequency,
        endDate: rule.end_date,
        nextRunOn: rule.next_run_on,
      },
      today,
    );

    if (dates.length > 0) {
      const magnitude = BigInt(rule.amount_minor);
      const amountMinor = rule.type === "expense" ? -magnitude : magnitude;

      // En serie a proposito: si la primera fecha dispara la descarga del
      // anio de cotizaciones, las siguientes ya la encuentran en la base.
      const rows = [];
      for (const date of dates) {
        rows.push({
          household_id: rule.household_id,
          account_id: rule.account_id,
          category_id: rule.category_id,
          type: rule.type,
          amount_minor: amountMinor.toString(),
          currency: rule.currency,
          fx_rate: await rateToFreeze(supabase, rule.currency, date),
          occurred_on: date,
          merchant: rule.merchant,
          notes: rule.notes,
          recurring_rule_id: rule.id,
          created_by: rule.created_by,
        });
      }

      const { data: inserted, error: insertError } = await supabase
        .from("transactions")
        .upsert(rows, {
          onConflict: "recurring_rule_id,occurred_on",
          ignoreDuplicates: true,
        })
        .select("id");
      // Si falla, la regla NO avanza: la proxima corrida lo reintenta.
      if (insertError) continue;
      created += inserted?.length ?? 0;
    }

    // Vencida sin nada que generar = la proxima fecha ya paso su fecha de
    // termino: la regla termino, igual que cuando nextRunOn vuelve null.
    const finished = nextRunOn === null || dates.length === 0;
    await supabase
      .from("recurring_rules")
      .update({
        next_run_on: nextRunOn ?? rule.next_run_on,
        active: !finished,
      })
      .eq("id", rule.id);
  }

  return created;
}

/** Corrida del cron: todos los households con reglas vencidas (requiere el cliente admin). */
export async function materializeAllHouseholds(admin: SupabaseClient): Promise<number> {
  const today = todayISO();
  const { data, error } = await admin
    .from("recurring_rules")
    .select("household_id")
    .eq("active", true)
    .lte("next_run_on", today);
  if (error) throw error;

  const householdIds = [...new Set((data ?? []).map((r) => r.household_id as string))];
  let created = 0;
  for (const householdId of householdIds) {
    created += await materializeDueRecurring(admin, householdId, today);
  }
  return created;
}
