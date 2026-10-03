import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/categorization";
import { convertAtDate, parseRate } from "@/lib/fx";
import {
  detectRecurringCharges,
  detectSmallSpending,
  type DetectedCharge,
  type ExpenseRecord,
  type SmallSpending,
} from "@/lib/detect";
import { daysBetween, todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { addDays } from "@/lib/recurrence";
import { loadRateBook } from "@/server/fx/rates";
import { getRecurringRules } from "./recurring";
import { fetchAll } from "./paginate";

/** Una compra de hasta esto (en pesos) se considera "chica" para el detector de gastos hormiga. */
const SMALL_THRESHOLD_CLP = 8_000n;
const HISTORY_DAYS = 400;

export type DetectedSubscription = DetectedCharge & {
  /** Ya existe una regla recurrente con ese comercio: no hay nada que declarar. */
  covered: boolean;
};

export type DetectionData = {
  subscriptions: DetectedSubscription[];
  smallSpending: SmallSpending[];
  thresholdMinor: bigint;
  windowDays: number;
  /** Costo anual de las suscripciones todavia no declaradas como recurrentes. */
  undeclaredAnnualMinor: bigint;
  smallAnnualMinor: bigint;
};

/**
 * Detecta, en el historial de gastos, los cargos que se repiten (posibles
 * suscripciones) y los gastos hormiga. Excluye los movimientos que ya
 * generaron las reglas recurrentes y las compras en cuotas.
 */
export async function getDetections(
  householdId: string,
  display: Currency,
): Promise<DetectionData> {
  const today = todayISO();
  const from = addDays(today, -HISTORY_DAYS);
  const supabase = await createClient();

  const [rows, planRows, rules, book] = await Promise.all([
    fetchAll<{
      id: string;
      occurred_on: string;
      merchant: string;
      amount_minor: string;
      currency: Currency;
      fx_rate: string | null;
      category: { name: string } | null;
    }>((start, end) =>
      supabase
        .from("transactions")
        .select(
          "id, occurred_on, merchant, amount_minor, currency, fx_rate, category:categories(name)",
        )
        .eq("household_id", householdId)
        .eq("type", "expense")
        .is("recurring_rule_id", null)
        .not("merchant", "is", null)
        .gte("occurred_on", from)
        .lte("occurred_on", today)
        .order("id")
        .range(start, end),
    ),
    supabase
      .from("installment_plans")
      .select("transaction_id")
      .eq("household_id", householdId),
    getRecurringRules(householdId),
    loadRateBook(supabase, from, today),
  ]);
  if (planRows.error) throw planRows.error;

  const planTransactions = new Set(
    (planRows.data ?? []).map((p) => p.transaction_id as string),
  );
  const records: ExpenseRecord[] = [];
  for (const row of rows) {
    if (planTransactions.has(row.id)) continue;
    const amount = BigInt(row.amount_minor);
    if (amount >= 0n) continue;
    const converted = convertAtDate(
      {
        amountMinor: -amount,
        currency: row.currency,
        occurredOn: row.occurred_on,
        frozenRate: parseRate(row.fx_rate),
      },
      display,
      book,
    );
    if (converted === null) continue;
    records.push({
      date: row.occurred_on,
      merchant: row.merchant,
      amountMinor: converted,
      categoryName: row.category?.name ?? null,
    });
  }

  const ruleKeys = rules
    .map((rule) => normalizeText(rule.merchant ?? ""))
    .filter((key) => key.length >= 3);
  const subscriptions: DetectedSubscription[] = detectRecurringCharges(records).map(
    (found) => ({
      ...found,
      covered: ruleKeys.some((key) => key.includes(found.key) || found.key.includes(key)),
    }),
  );

  const thresholdMinor =
    convertAtDate(
      {
        amountMinor: SMALL_THRESHOLD_CLP,
        currency: "CLP",
        occurredOn: today,
        frozenRate: null,
      },
      display,
      book,
    ) ?? SMALL_THRESHOLD_CLP;

  // Con poca historia no se anualiza sobre 90 dias que no existen.
  const earliest = records.reduce((min, r) => (r.date < min ? r.date : min), today);
  const windowDays = Math.min(90, Math.max(30, daysBetween(earliest, today) + 1));

  const smallSpending = detectSmallSpending({
    records,
    today,
    thresholdMinor,
    windowDays,
    excludeKeys: new Set(subscriptions.map((s) => s.key)),
  });

  return {
    subscriptions,
    smallSpending,
    thresholdMinor,
    windowDays,
    undeclaredAnnualMinor: subscriptions
      .filter((s) => !s.covered)
      .reduce((sum, s) => sum + s.annualizedMinor, 0n),
    smallAnnualMinor: smallSpending.reduce((sum, s) => sum + s.annualizedMinor, 0n),
  };
}
