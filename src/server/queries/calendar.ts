import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  cardEvents,
  loanEvents,
  maturityEvents,
  recurringEvents,
  sortEvents,
  type CalendarEvent,
  type GeneratedInput,
} from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { addDays } from "@/lib/recurrence";
import type { Currency } from "@/lib/money";
import { getRecurringRules } from "./recurring";
import { getCardData } from "./cards";
import { getLoans } from "./loans";
import { getHoldings } from "./investments";

/**
 * Eventos del calendario financiero entre `from` y `to` (inclusive):
 * recurrentes (lo ya generado desde los movimientos reales, lo que viene
 * desde las reglas), cierres y facturacion de tarjetas, y cuotas de
 * prestamos. Ver src/lib/calendar.ts.
 */
export async function getCalendarEvents(
  householdId: string,
  from: string,
  to: string,
  client?: SupabaseClient,
): Promise<CalendarEvent[]> {
  const today = todayISO();
  const supabase = client ?? (await createClient());
  const generatedTo = to < today ? to : today;

  const [rules, generatedResult, cardData, loans, holdings] = await Promise.all([
    getRecurringRules(householdId, supabase),
    // Los movimientos ya generados por reglas, solo hasta hoy (lo que viene sale de las reglas).
    from <= generatedTo
      ? supabase
          .from("transactions")
          .select(
            "id, type, amount_minor, currency, occurred_on, merchant, category:categories(name)",
          )
          .eq("household_id", householdId)
          .not("recurring_rule_id", "is", null)
          .gte("occurred_on", from)
          .lte("occurred_on", generatedTo)
      : Promise.resolve({ data: [], error: null }),
    // Compras de contado de ~70 dias antes: cubre el ciclo que termina dentro del rango.
    getCardData(householdId, addDays(from, -70), supabase),
    getLoans(householdId, supabase),
    getHoldings(householdId, supabase),
  ]);
  if (generatedResult.error) throw generatedResult.error;

  const generated: GeneratedInput[] = (
    (generatedResult.data ?? []) as unknown as {
      id: string;
      type: "income" | "expense";
      amount_minor: string;
      currency: Currency;
      occurred_on: string;
      merchant: string | null;
      category: { name: string } | null;
    }[]
  ).map((tx) => ({
    id: tx.id,
    date: tx.occurred_on,
    type: tx.type,
    label: tx.merchant || tx.category?.name || "Recurrente",
    amountMinor: BigInt(tx.amount_minor),
    currency: tx.currency,
  }));

  const events = [
    ...recurringEvents({
      rules: rules.map((rule) => ({
        id: rule.id,
        type: rule.type,
        label: rule.merchant || rule.category?.name || "Recurrente",
        amountMinor: BigInt(rule.amount_minor),
        currency: rule.currency,
        frequency: rule.frequency,
        startDate: rule.start_date,
        endDate: rule.end_date,
        nextRunOn: rule.next_run_on,
        active: rule.active,
      })),
      generated,
      from,
      to,
    }),
    ...cardEvents({
      cards: cardData.cards.map((card) => ({
        id: card.id,
        name: card.name,
        currency: card.currency,
        closeDay: card.statement_close_day,
        dueDay: card.payment_due_day,
      })),
      plans: cardData.plans,
      charges: cardData.charges,
      payments: cardData.payments,
      from,
      to,
      today,
    }),
    ...maturityEvents({
      deposits: holdings.flatMap((holding) =>
        // Solo depositos vigentes: uno ya cobrado (valor cero) no vuelve a vencer.
        holding.method === "fixed_term" &&
        !holding.archived &&
        holding.maturity &&
        holding.metrics.valueMinor > 0n
          ? [
              {
                id: holding.id,
                name: holding.name,
                currency: holding.currency,
                end: holding.maturity.end,
                totalMinor: holding.maturity.totalAtMaturityMinor,
              },
            ]
          : [],
      ),
      from,
      to,
    }),
    ...loanEvents({
      loans: loans.map((loan) => ({
        id: loan.id,
        name: loan.name,
        currency: loan.currency,
        rows: loan.rows,
      })),
      from,
      to,
    }),
  ];

  return sortEvents(events);
}
