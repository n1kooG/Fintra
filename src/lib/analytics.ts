/**
 * Reportes: totales mensuales, evolucion y comparativas entre periodos.
 * Logica pura sobre movimientos ya cargados y un RateBook — las
 * consultas viven en src/server/queries/analytics.ts. Reusa la
 * consolidacion de src/lib/reports.ts (cada movimiento con la cotizacion
 * de su fecha, redondeo unico al final, sin sumar lo que no se puede
 * convertir).
 */

import { convertAtDate, parseRate, type RateBook } from "./fx";
import type { Currency } from "./money";
import { monthKeyOf, shiftMonth } from "./dates";
import {
  breakdownByCategory,
  summarize,
  type CategoryBreakdownRow,
  type ReportTransaction,
} from "./reports";

/** Los `count` meses que terminan en `endMonth` (inclusive), del mas antiguo al mas reciente. */
export function monthKeysEndingAt(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
}

export type MonthTotals = {
  monthKey: string;
  incomeMinor: bigint;
  /** Negativo (los gastos se guardan con signo menos). */
  expenseMinor: bigint;
  balanceMinor: bigint;
  /** Movimientos del mes que quedaron fuera por falta de cotizacion. */
  unconverted: number;
};

function groupByMonth(
  transactions: ReportTransaction[],
): Map<string, ReportTransaction[]> {
  const map = new Map<string, ReportTransaction[]>();
  for (const tx of transactions) {
    const key = monthKeyOf(tx.occurred_on);
    const list = map.get(key) ?? [];
    list.push(tx);
    map.set(key, list);
  }
  return map;
}

/** Ingresos, gastos y balance de cada mes pedido (los meses sin movimientos salen en cero). */
export function monthlyTotals(
  transactions: ReportTransaction[],
  monthKeys: string[],
  display: Currency,
  book: RateBook,
): MonthTotals[] {
  const byMonth = groupByMonth(transactions);
  return monthKeys.map((monthKey) => {
    const summary = summarize(byMonth.get(monthKey) ?? [], display, book);
    return {
      monthKey,
      incomeMinor: summary.incomeMinor,
      expenseMinor: summary.expenseMinor,
      balanceMinor: summary.balanceMinor,
      unconverted: summary.unconverted,
    };
  });
}

/** Gasto por categoria de un mes (positivo, de mayor a menor). */
export function monthBreakdown(
  transactions: ReportTransaction[],
  monthKey: string,
  display: Currency,
  book: RateBook,
): { rows: CategoryBreakdownRow[]; unconverted: number } {
  const inMonth = transactions.filter((tx) => monthKeyOf(tx.occurred_on) === monthKey);
  return breakdownByCategory(inMonth, display, book);
}

export type Delta = {
  currentMinor: bigint;
  previousMinor: bigint;
  deltaMinor: bigint;
  /** Variacion sobre el valor absoluto del periodo anterior, con 1 decimal; null si el anterior es cero. */
  deltaPercent: number | null;
};

export function delta(currentMinor: bigint, previousMinor: bigint): Delta {
  const deltaMinor = currentMinor - previousMinor;
  const base = previousMinor < 0n ? -previousMinor : previousMinor;
  return {
    currentMinor,
    previousMinor,
    deltaMinor,
    deltaPercent: base === 0n ? null : Number((deltaMinor * 1000n) / base) / 10,
  };
}

export type ComparedCategory = {
  categoryId: string | null;
  name: string;
  currentMinor: bigint;
  previousMinor: bigint;
  deltaMinor: bigint;
  deltaPercent: number | null;
  /** Parte del gasto total del periodo actual, con 1 decimal. */
  sharePercent: number;
};

/**
 * Gasto por categoria del periodo actual contra el anterior. Incluye las
 * categorias que solo existieron en uno de los dos (con 0 en el otro),
 * ordenadas por gasto actual y, a igualdad, por gasto anterior.
 */
export function compareBreakdowns(
  current: CategoryBreakdownRow[],
  previous: CategoryBreakdownRow[],
): ComparedCategory[] {
  const keyOf = (row: CategoryBreakdownRow) => row.categoryId ?? "sin-categoria";
  const merged = new Map<
    string,
    { row: CategoryBreakdownRow; current: bigint; previous: bigint }
  >();

  for (const row of previous) {
    merged.set(keyOf(row), { row, current: 0n, previous: row.totalMinor });
  }
  for (const row of current) {
    const existing = merged.get(keyOf(row));
    if (existing) {
      existing.current = row.totalMinor;
      existing.row = row;
    } else {
      merged.set(keyOf(row), { row, current: row.totalMinor, previous: 0n });
    }
  }

  const total = [...merged.values()].reduce((sum, entry) => sum + entry.current, 0n);
  return [...merged.values()]
    .map(({ row, current: cur, previous: prev }) => {
      const d = delta(cur, prev);
      return {
        categoryId: row.categoryId,
        name: row.name,
        currentMinor: cur,
        previousMinor: prev,
        deltaMinor: d.deltaMinor,
        deltaPercent: d.deltaPercent,
        sharePercent: total > 0n ? Number((cur * 1000n) / total) / 10 : 0,
      };
    })
    .sort((a, b) =>
      b.currentMinor !== a.currentMinor
        ? b.currentMinor > a.currentMinor
          ? 1
          : -1
        : b.previousMinor > a.previousMinor
          ? 1
          : b.previousMinor < a.previousMinor
            ? -1
            : 0,
    );
}

// ---------------------------------------------------------------------------
// Tasa de ahorro
// ---------------------------------------------------------------------------

/**
 * Tasa de ahorro = (ingresos - gastos) / ingresos, en %, con 1 decimal. Puede
 * ser negativa (se gasto mas de lo que entro). Null si no hubo ingresos.
 */
export function savingsRatePercent(totals: {
  incomeMinor: bigint;
  /** Negativo, como lo entrega `monthlyTotals`. */
  expenseMinor: bigint;
}): number | null {
  if (totals.incomeMinor <= 0n) return null;
  const saved = totals.incomeMinor + totals.expenseMinor;
  return Number((saved * 1000n) / totals.incomeMinor) / 10;
}

// ---------------------------------------------------------------------------
// Gastos inusuales
// ---------------------------------------------------------------------------

export type UnusualInput = ReportTransaction & {
  id: string;
  merchant?: string | null;
};

export type UnusualExpense = {
  id: string;
  date: string;
  merchant: string | null;
  categoryName: string;
  /** Monto del gasto en la moneda de visualizacion (positivo). */
  amountMinor: bigint;
  /** Mediana de lo que sueles gastar en esa categoria. */
  typicalMinor: bigint;
  /** Cuantas veces la mediana. */
  ratio: number;
};

/** Por debajo de esto un gasto no se marca aunque sea "raro": es ruido. */
const MIN_UNUSUAL_MINOR: Record<Currency, bigint> = {
  CLP: 20_000n,
  USD: 2_000n,
  EUR: 2_000n,
  UF: 100n,
  UTM: 1n,
};

function median(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

/**
 * Gastos del mes que se salen de lo habitual en su categoria: al menos
 * `ratio` veces (2,5 por defecto) la mediana de los meses anteriores de esa
 * categoria. Pide al menos 3 gastos previos como referencia y un monto minimo,
 * para no marcar categorias nuevas ni gastos chicos. Los mas grandes primero.
 */
export function unusualExpenses(args: {
  transactions: UnusualInput[];
  monthKey: string;
  display: Currency;
  book: RateBook;
  ratio?: number;
  limit?: number;
}): UnusualExpense[] {
  const { transactions, monthKey, display, book } = args;
  const ratio = args.ratio ?? 2.5;
  const minimum = MIN_UNUSUAL_MINOR[display];

  const history = new Map<string, bigint[]>();
  const candidates: { tx: UnusualInput; amount: bigint }[] = [];

  for (const tx of transactions) {
    if (tx.type !== "expense" || !tx.category_id) continue;
    const converted = convertAtDate(
      {
        amountMinor: BigInt(tx.amount_minor),
        currency: tx.currency,
        occurredOn: tx.occurred_on,
        frozenRate: parseRate(tx.fx_rate),
      },
      display,
      book,
    );
    if (converted === null) continue;
    const amount = converted < 0n ? -converted : converted;
    const key = monthKeyOf(tx.occurred_on);
    if (key === monthKey) candidates.push({ tx, amount });
    else if (key < monthKey) {
      const list = history.get(tx.category_id) ?? [];
      list.push(amount);
      history.set(tx.category_id, list);
    }
  }

  const found: UnusualExpense[] = [];
  for (const { tx, amount } of candidates) {
    const past = history.get(tx.category_id!);
    if (!past || past.length < 3 || amount < minimum) continue;
    const typical = median(past);
    if (typical <= 0n) continue;
    const times = Number((amount * 100n) / typical) / 100;
    if (times < ratio) continue;
    found.push({
      id: tx.id,
      date: tx.occurred_on,
      merchant: tx.merchant ?? null,
      categoryName: tx.category?.name ?? "Sin categoría",
      amountMinor: amount,
      typicalMinor: typical,
      ratio: Math.round(times * 10) / 10,
    });
  }

  return found
    .sort((a, b) =>
      b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : 0,
    )
    .slice(0, args.limit ?? 5);
}
