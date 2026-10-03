/**
 * Totales consolidados en una sola moneda de visualizacion, a partir de
 * movimientos y cuentas en monedas distintas. Logica pura sobre un
 * RateBook ya cargado — las consultas viven en src/server/queries.
 *
 * Criterio de fechas (ver src/lib/fx.ts):
 * - Movimientos: cotizacion de SU fecha (la congelada, o la del libro).
 *   Un gasto de marzo en dolares vale lo mismo en pesos hoy que en marzo.
 * - Saldos de cuentas: cotizacion de HOY, porque es lo que valen ahora.
 *
 * Lo que no se puede convertir (falta la cotizacion) no se suma: se
 * cuenta en `unconverted` para que la interfaz lo avise, en vez de
 * mostrar un total que parece exacto y no lo es.
 *
 * Los totales se acumulan con PRECISION digitos extra y se redondean una
 * sola vez al final: sumar 100 gastos ya redondeados a 0,01 UF (~$400
 * cada redondeo) podria desviar el total en decenas de miles de pesos.
 */

const PRECISION = 10_000n;

function round(scaled: bigint): bigint {
  return divRound(scaled, PRECISION);
}

import { convertAtDate, divRound, parseRate, type RateBook } from "./fx";
import type { Currency } from "./money";
import type { AccountType, TransactionType } from "./supabase/types";

export type ReportTransaction = {
  type: TransactionType;
  amount_minor: string;
  currency: Currency;
  fx_rate: string | null;
  occurred_on: string;
  category_id?: string | null;
  category?: { id: string; name: string } | null;
};

/** Monto del movimiento en la moneda destino, escalado por PRECISION. */
function toTarget(
  tx: ReportTransaction,
  target: Currency,
  book: RateBook,
): bigint | null {
  return convertAtDate(
    {
      amountMinor: BigInt(tx.amount_minor),
      currency: tx.currency,
      occurredOn: tx.occurred_on,
      frozenRate: parseRate(tx.fx_rate),
    },
    target,
    book,
    PRECISION,
  );
}

export type Summary = {
  incomeMinor: bigint;
  /** Negativo (los gastos se guardan con signo menos). */
  expenseMinor: bigint;
  balanceMinor: bigint;
  expenseCount: number;
  unconverted: number;
};

/** Ingresos, gastos y balance. Las transferencias no cuentan: son plata que cambia de bolsillo. */
export function summarize(
  transactions: ReportTransaction[],
  target: Currency,
  book: RateBook,
): Summary {
  let incomeMinor = 0n;
  let expenseMinor = 0n;
  let expenseCount = 0;
  let unconverted = 0;

  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    const value = toTarget(tx, target, book);
    if (value === null) {
      unconverted++;
      continue;
    }
    if (tx.type === "income") {
      incomeMinor += value;
    } else {
      expenseMinor += value;
      expenseCount++;
    }
  }

  return {
    incomeMinor: round(incomeMinor),
    expenseMinor: round(expenseMinor),
    balanceMinor: round(incomeMinor + expenseMinor),
    expenseCount,
    unconverted,
  };
}

export type CategoryBreakdownRow = {
  categoryId: string | null;
  name: string;
  /** Positivo: total gastado en la categoria. */
  totalMinor: bigint;
};

/** Gasto por categoria, de mayor a menor. */
export function breakdownByCategory(
  transactions: ReportTransaction[],
  target: Currency,
  book: RateBook,
): { rows: CategoryBreakdownRow[]; unconverted: number } {
  const totals = new Map<string, CategoryBreakdownRow>();
  let unconverted = 0;

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const value = toTarget(tx, target, book);
    if (value === null) {
      unconverted++;
      continue;
    }
    const key = tx.category_id ?? "sin-categoria";
    const row = totals.get(key) ?? {
      categoryId: tx.category_id ?? null,
      name: tx.category?.name ?? "Sin categoría",
      totalMinor: 0n,
    };
    row.totalMinor += -value;
    totals.set(key, row);
  }

  const rows = Array.from(totals.values(), (row) => ({
    ...row,
    totalMinor: round(row.totalMinor),
  })).sort((a, b) =>
    b.totalMinor > a.totalMinor ? 1 : b.totalMinor < a.totalMinor ? -1 : 0,
  );
  return { rows, unconverted };
}

const LIABILITY_TYPES: AccountType[] = ["credit_card", "loan"];

export type BalanceAccount = {
  id: string;
  type: AccountType;
  currency: Currency;
  balanceMinor: bigint;
};

export type NetWorth = {
  assetsMinor: bigint;
  /** Negativo o cero: lo que se debe. */
  liabilitiesMinor: bigint;
  netWorthMinor: bigint;
  /** Saldo de cada cuenta en la moneda de visualizacion (null si no se pudo convertir). */
  convertedById: Map<string, bigint | null>;
  unconverted: number;
};

/** Activos, pasivos y patrimonio neto a la cotizacion de `today`. */
export function consolidateBalances(
  accounts: BalanceAccount[],
  target: Currency,
  book: RateBook,
  today: string,
): NetWorth {
  let assetsMinor = 0n;
  let liabilitiesMinor = 0n;
  let unconverted = 0;
  const convertedById = new Map<string, bigint | null>();

  for (const account of accounts) {
    const value = convertAtDate(
      {
        amountMinor: account.balanceMinor,
        currency: account.currency,
        occurredOn: today,
        frozenRate: null,
      },
      target,
      book,
      PRECISION,
    );
    convertedById.set(account.id, value === null ? null : round(value));
    if (value === null) {
      unconverted++;
    } else if (LIABILITY_TYPES.includes(account.type)) {
      liabilitiesMinor += value;
    } else {
      assetsMinor += value;
    }
  }

  return {
    assetsMinor: round(assetsMinor),
    liabilitiesMinor: round(liabilitiesMinor),
    netWorthMinor: round(assetsMinor + liabilitiesMinor),
    convertedById,
    unconverted,
  };
}
