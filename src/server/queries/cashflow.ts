import "server-only";
import { createClient } from "@/lib/supabase/server";
import { convertAtDate } from "@/lib/fx";
import {
  capCardBillings,
  estimateVariableMonthly,
  pendingCashEvents,
  projectCashFlow,
  scaleVariable,
  type Projection,
  type VariableEstimate,
} from "@/lib/cashflow";
import { monthBounds, monthKeyOf, shiftMonth, todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { monthlyTotals } from "@/lib/analytics";
import type { ReportTransaction } from "@/lib/reports";
import { loadRateBook } from "@/server/fx/rates";
import { getAccountsWithBalances } from "./accounts";
import { getCalendarEvents } from "./calendar";
import { fetchAll } from "./paginate";

const LIQUID_TYPES = ["cash", "checking", "savings"];

export type CashFlowData = {
  projection: Projection;
  estimate: VariableEstimate;
  /** Cuentas liquidas que entraron al saldo inicial. */
  liquidAccounts: number;
  /** Saldos o eventos que quedaron fuera por falta de cotizacion. */
  unconverted: number;
  /** Escenario aplicado al gasto variable (0 = tal cual). */
  scenarioPercent: number;
};

/**
 * Proyeccion de flujo de caja a 6 meses en la moneda de visualizacion.
 * Todo se convierte con la cotizacion de HOY (no se conocen las futuras).
 * Ver src/lib/cashflow.ts para las reglas y sus limites.
 */
export async function getCashFlowProjection(
  householdId: string,
  display: Currency,
  scenarioPercent = 0,
): Promise<CashFlowData> {
  const today = todayISO();
  const currentMonth = monthKeyOf(today);
  const horizonEnd = monthBounds(shiftMonth(currentMonth, 6)).to;
  const variableFrom = monthBounds(shiftMonth(currentMonth, -3)).from;
  const supabase = await createClient();

  const [accounts, events, variableRows, planRows, book] = await Promise.all([
    getAccountsWithBalances(householdId),
    getCalendarEvents(householdId, today, horizonEnd),
    // Gasto "suelto": ni generado por una regla recurrente ni compra en cuotas
    // (esos ya estan como eventos programados).
    fetchAll<ReportTransaction & { id: string }>((from, to) =>
      supabase
        .from("transactions")
        .select("id, type, amount_minor, currency, fx_rate, occurred_on")
        .eq("household_id", householdId)
        .eq("type", "expense")
        .is("recurring_rule_id", null)
        .gte("occurred_on", variableFrom)
        .lte("occurred_on", today)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("installment_plans")
      .select("transaction_id")
      .eq("household_id", householdId),
    loadRateBook(supabase, variableFrom, horizonEnd),
  ]);
  if (planRows.error) throw planRows.error;

  let unconverted = 0;
  const toDisplay = (amountMinor: bigint, currency: Currency) =>
    convertAtDate(
      { amountMinor, currency, occurredOn: today, frozenRate: null },
      display,
      book,
    );

  let startingBalanceMinor = 0n;
  let liquidAccounts = 0;
  const owedByCard = new Map<string, bigint>();
  for (const account of accounts) {
    if (LIQUID_TYPES.includes(account.type)) {
      const value = toDisplay(BigInt(account.balanceMinor), account.currency);
      liquidAccounts++;
      if (value === null) unconverted++;
      else startingBalanceMinor += value;
    } else if (account.type === "credit_card") {
      const owed = account.balanceMinor < 0n ? -account.balanceMinor : 0n;
      const value = toDisplay(owed, account.currency);
      if (value === null) unconverted++;
      else owedByCard.set(account.id, value);
    }
  }

  const cashEvents = capCardBillings(
    pendingCashEvents(events, today, (event) =>
      toDisplay(event.amountMinor ?? 0n, event.currency),
    ),
    owedByCard,
  );

  const planTransactions = new Set(
    (planRows.data ?? []).map((p) => p.transaction_id as string),
  );
  const variableTxs = variableRows.filter((tx) => !planTransactions.has(tx.id));
  const monthKeys = [-3, -2, -1, 0].map((offset) => shiftMonth(currentMonth, offset));
  const totalsByMonth = new Map<string, bigint>();
  for (const month of monthlyTotals(variableTxs, monthKeys, display, book)) {
    unconverted += month.unconverted;
    if (month.expenseMinor < 0n) totalsByMonth.set(month.monthKey, -month.expenseMinor);
  }
  const estimate = estimateVariableMonthly({ totalsByMonth, today });

  return {
    projection: projectCashFlow({
      today,
      monthsAhead: 6,
      startingBalanceMinor,
      events: cashEvents,
      variableMonthlyMinor: scaleVariable(estimate.monthlyMinor, scenarioPercent),
    }),
    estimate,
    liquidAccounts,
    unconverted,
    scenarioPercent,
  };
}
