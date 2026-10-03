/**
 * Presupuestos mensuales por categoria y "disponible por dia"
 * (safe-to-spend). Logica pura sobre datos ya cargados — las consultas
 * viven en src/server/queries/budgets.ts.
 *
 * Reglas:
 * - Un presupuesto es un tope mensual para UNA categoria de gasto, en la
 *   moneda en que se definio. Lo gastado se convierte a esa moneda con
 *   la cotizacion de cada movimiento (src/lib/fx.ts), asi el porcentaje
 *   no se mueve cuando cambia el dolar.
 * - "Disponible" = suma de lo presupuestado - suma de lo gastado, SOLO en
 *   las categorias con presupuesto: pasarse en una categoria se come lo
 *   que sobra en otra. El gasto en categorias sin presupuesto se muestra
 *   aparte y no resta.
 * - "Disponible por dia" = disponible / dias que quedan del mes
 *   (contando hoy), redondeado hacia abajo: mejor quedarse corto que
 *   prometer de mas.
 * - ARRASTRE: un presupuesto puede traer lo que SOBRO el mes anterior
 *   (presupuesto base - gastado, si es positivo). Un exceso no se arrastra.
 *   Solo mira el mes inmediatamente anterior, sin cadena.
 * - COMPROMETIDO: gastos recurrentes que aun faltan este mes. Se descuentan
 *   del disponible de su categoria (o de la principal que tenga presupuesto),
 *   para que "disponible real" no prometa plata que ya tiene destino. Las
 *   facturas de tarjeta NO cuentan: esas compras ya se restaron al hacerse.
 * - TOPE TOTAL: un limite para TODO el gasto del mes, tenga o no presupuesto
 *   por categoria. Si existe, manda sobre el "por dia".
 */

import { convertAtDate, type RateBook } from "./fx";
import type { Currency } from "./money";
import { daysBetween, monthBounds, monthKeyOf } from "./dates";
import { summarize, type ReportTransaction } from "./reports";

/** Desde este porcentaje de lo presupuestado se avisa (junto con el 100%). */
export const WARNING_PERCENT = 80n;

export type BudgetStatus = "ok" | "warning" | "over";

/**
 * Porcentaje usado (entero, hacia abajo, puede pasar de 100) y estado:
 * `warning` desde el 80% y `over` desde el 100% (tope alcanzado o pasado).
 */
export function budgetStatus(
  spentMinor: bigint,
  budgetMinor: bigint,
): { percent: number; status: BudgetStatus } {
  const spent = spentMinor < 0n ? 0n : spentMinor;
  if (budgetMinor <= 0n) return { percent: 0, status: spent > 0n ? "over" : "ok" };

  const percent = Number((spent * 100n) / budgetMinor);
  if (spent >= budgetMinor) return { percent, status: "over" };
  if (spent * 100n >= budgetMinor * WARNING_PERCENT)
    return { percent, status: "warning" };
  return { percent, status: "ok" };
}

export type SafeToSpend = {
  /** Lo que queda por gastar en el mes (puede ser <= 0). */
  remainingMinor: bigint;
  /** Dias que quedan del mes, contando hoy (minimo 1). */
  daysLeft: number;
  /** Lo que se puede gastar por dia sin pasarse; 0 si ya no queda nada. */
  perDayMinor: bigint;
};

export function safeToSpend(remainingMinor: bigint, today: string): SafeToSpend {
  const { to } = monthBounds(monthKeyOf(today));
  const daysLeft = daysBetween(today, to) + 1;
  const perDayMinor = remainingMinor > 0n ? remainingMinor / BigInt(daysLeft) : 0n;
  return { remainingMinor, daysLeft, perDayMinor };
}

export type BudgetInput = {
  id: string;
  categoryId: string;
  categoryName: string;
  /** Monto base del presupuesto (sin arrastre). */
  amountMinor: bigint;
  currency: Currency;
  /** Si trae lo que sobro el mes anterior. */
  rollover?: boolean;
};

/** Gasto recurrente que aun falta este mes (magnitud positiva). */
export type Commitment = {
  categoryId: string | null;
  amountMinor: bigint;
  currency: Currency;
};

/** Tope total de gasto del mes, en la moneda en que se definio. */
export type TotalCap = { id: string; amountMinor: bigint; currency: Currency };

export type BudgetLineView = Omit<BudgetInput, "amountMinor"> & {
  /** Tope efectivo del mes: base + arrastre. */
  amountMinor: bigint;
  /** Lo definido por la persona, sin arrastre. */
  baseMinor: bigint;
  /** Lo que sobro del mes anterior y se suma a este (0 si no aplica). */
  carryMinor: bigint;
  /** Recurrentes que faltan este mes en esta categoria, en la moneda del presupuesto. */
  committedMinor: bigint;
  /** Lo que realmente queda: tope - gastado - comprometido. */
  availableMinor: bigint;
  /** Gastado en la categoria, en la moneda del presupuesto (positivo). */
  spentMinor: bigint;
  remainingMinor: bigint;
  percent: number;
  status: BudgetStatus;
  /** Gastos de la categoria que no se pudieron convertir por falta de cotizacion. */
  unconverted: number;
};

export type TotalCapView = {
  id: string;
  capMinor: bigint;
  /** Todo lo gastado en el mes, con o sin presupuesto por categoria. */
  spentMinor: bigint;
  /** Todos los recurrentes que faltan este mes. */
  committedMinor: bigint;
  remainingMinor: bigint;
  percent: number;
  status: BudgetStatus;
};

export type BudgetMonth = {
  monthKey: string;
  isCurrent: boolean;
  lines: BudgetLineView[];
  display: Currency;
  /** Totales en la moneda de visualizacion (solo categorias con presupuesto). */
  totals: {
    budgetMinor: bigint;
    spentMinor: bigint;
    remainingMinor: bigint;
    /** Recurrentes que faltan en categorias con presupuesto. */
    committedMinor: bigint;
    /** remaining - committed: el "disponible real". */
    availableMinor: bigint;
  };
  /** Tope total del mes con su avance (todo el gasto), si se definio uno. */
  total: TotalCapView | null;
  /** Solo para el mes en curso. Usa el tope total si existe; si no, los presupuestos. */
  safe: SafeToSpend | null;
  /** Gasto del mes en categorias sin presupuesto, en la moneda de visualizacion. */
  unbudgetedSpentMinor: bigint;
  /** Montos que quedaron fuera de los totales por falta de cotizacion. */
  unconverted: number;
};

/**
 * Lo que sobro de un presupuesto el mes anterior: base - gastado, en la moneda
 * del presupuesto anterior; nunca negativo. `expenses` ya viene acotado al mes
 * y a esa categoria (o sus subcategorias).
 */
export function rolloverCarry(
  previous: BudgetInput,
  expenses: ReportTransaction[],
  book: RateBook,
): bigint {
  const spent = -summarize(
    expenses.filter((tx) => tx.type === "expense"),
    previous.currency,
    book,
  ).expenseMinor;
  const left = previous.amountMinor - spent;
  return left > 0n ? left : 0n;
}

export function buildBudgetMonth(args: {
  monthKey: string;
  today: string;
  display: Currency;
  budgets: BudgetInput[];
  expenses: ReportTransaction[];
  book: RateBook;
  /** Recurrentes que aun faltan este mes (solo tiene sentido en el mes en curso). */
  commitments?: Commitment[];
  /** Tope total de gasto del mes, si se definio. */
  totalCap?: TotalCap | null;
  /** Mes anterior, para el arrastre: sus presupuestos y gastos (ya agrupados por la categoria que los cubre). */
  previous?: { budgets: BudgetInput[]; expenses: ReportTransaction[] };
}): BudgetMonth {
  const { monthKey, today, display, budgets, book } = args;
  const commitments = args.commitments ?? [];
  const expenses = args.expenses.filter((tx) => tx.type === "expense");
  const { to } = monthBounds(monthKey);
  const isCurrent = monthKeyOf(today) === monthKey;
  // Para convertir presupuestos entre monedas: la cotizacion del dia, o
  // la del ultimo dia del mes si ese mes ya paso.
  const rateDate = to < today ? to : today;

  const byCategory = new Map<string, ReportTransaction[]>();
  const budgetedCategories = new Set(budgets.map((b) => b.categoryId));
  const unbudgeted: ReportTransaction[] = [];
  for (const tx of expenses) {
    if (tx.category_id && budgetedCategories.has(tx.category_id)) {
      const list = byCategory.get(tx.category_id) ?? [];
      list.push(tx);
      byCategory.set(tx.category_id, list);
    } else {
      unbudgeted.push(tx);
    }
  }

  let unconverted = 0;
  let totalBudget = 0n;
  let totalSpent = 0n;
  let counted = 0;

  const toCurrency = (amountMinor: bigint, from: Currency, to: Currency) =>
    from === to
      ? amountMinor
      : convertAtDate(
          { amountMinor, currency: from, occurredOn: rateDate, frozenRate: null },
          to,
          book,
        );

  let totalCommitted = 0n;
  const lines: BudgetLineView[] = budgets.map((budget) => {
    const txs = byCategory.get(budget.categoryId) ?? [];

    // Arrastre: lo que sobro el mes anterior en la misma categoria.
    let carryMinor = 0n;
    if (budget.rollover && args.previous) {
      const prior = args.previous.budgets.find((b) => b.categoryId === budget.categoryId);
      if (prior) {
        const priorSpend = args.previous.expenses.filter(
          (tx) => tx.category_id === budget.categoryId,
        );
        const carried = rolloverCarry(prior, priorSpend, book);
        carryMinor = toCurrency(carried, prior.currency, budget.currency) ?? 0n;
      }
    }
    const effectiveMinor = budget.amountMinor + carryMinor;

    // Recurrentes que faltan en esta categoria, en la moneda del presupuesto.
    let committedMinor = 0n;
    for (const c of commitments) {
      if (c.categoryId !== budget.categoryId) continue;
      committedMinor += toCurrency(c.amountMinor, c.currency, budget.currency) ?? 0n;
    }

    const inOwnCurrency = summarize(txs, budget.currency, book);
    const spentMinor = -inOwnCurrency.expenseMinor;
    const { percent, status } = budgetStatus(spentMinor, effectiveMinor);

    // Aporte a los totales, en la moneda de visualizacion.
    const budgetInDisplay = convertAtDate(
      {
        amountMinor: effectiveMinor,
        currency: budget.currency,
        occurredOn: rateDate,
        frozenRate: null,
      },
      display,
      book,
    );
    const committedInDisplay = toCurrency(committedMinor, budget.currency, display);
    if (committedInDisplay !== null) totalCommitted += committedInDisplay;
    const inDisplay = summarize(txs, display, book);
    unconverted += inDisplay.unconverted;
    if (budgetInDisplay === null) {
      unconverted++;
    } else {
      totalBudget += budgetInDisplay;
      totalSpent += -inDisplay.expenseMinor;
      counted++;
    }

    return {
      ...budget,
      amountMinor: effectiveMinor,
      baseMinor: budget.amountMinor,
      carryMinor,
      committedMinor,
      spentMinor,
      remainingMinor: effectiveMinor - spentMinor,
      availableMinor: effectiveMinor - spentMinor - committedMinor,
      percent,
      status,
      unconverted: inOwnCurrency.unconverted,
    };
  });

  lines.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "es"));

  const unbudgetedSummary = summarize(unbudgeted, display, book);
  unconverted += unbudgetedSummary.unconverted;

  const remainingMinor = totalBudget - totalSpent;
  const availableMinor = remainingMinor - totalCommitted;
  const unbudgetedSpentMinor = -unbudgetedSummary.expenseMinor;

  // Tope total: TODO el gasto del mes (con o sin presupuesto) contra un solo limite.
  let total: TotalCapView | null = null;
  if (args.totalCap) {
    const capMinor = toCurrency(
      args.totalCap.amountMinor,
      args.totalCap.currency,
      display,
    );
    if (capMinor === null) {
      unconverted++;
    } else {
      let allCommitted = 0n;
      for (const c of commitments)
        allCommitted += toCurrency(c.amountMinor, c.currency, display) ?? 0n;
      const spentMinor = totalSpent + unbudgetedSpentMinor;
      const { percent, status } = budgetStatus(spentMinor, capMinor);
      total = {
        id: args.totalCap.id,
        capMinor,
        spentMinor,
        committedMinor: allCommitted,
        remainingMinor: capMinor - spentMinor - allCommitted,
        percent,
        status,
      };
    }
  }

  // El "por dia" usa el tope total si existe; si no, los presupuestos por categoria.
  const safeBase = total ? total.remainingMinor : availableMinor;
  return {
    monthKey,
    isCurrent,
    lines,
    display,
    totals: {
      budgetMinor: totalBudget,
      spentMinor: totalSpent,
      remainingMinor,
      committedMinor: totalCommitted,
      availableMinor,
    },
    total,
    safe: isCurrent && (counted > 0 || total) ? safeToSpend(safeBase, today) : null,
    unbudgetedSpentMinor,
    unconverted,
  };
}
