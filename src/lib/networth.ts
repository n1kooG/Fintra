/**
 * Curva historica del patrimonio neto (activos menos pasivos). Logica
 * pura: se RECONSTRUYE desde los datos (movimientos, valorizaciones,
 * tabla de amortizacion), en vez de guardar fotos mensuales. Asi es
 * retroactiva y siempre coincide con lo que hoy muestran las demas
 * pantallas, aunque se corrija un movimiento antiguo.
 *
 * En cada fecha:
 * - Cuentas: saldo inicial + movimientos hasta esa fecha. Las tarjetas de
 *   credito y las cuentas de tipo prestamo son pasivos.
 * - Instrumentos: su valor en esa fecha (src/lib/holding-value.ts).
 * - Prestamos: capital pendiente en esa fecha (src/lib/loans.ts), desde
 *   un mes antes de la primera cuota (se asume que se otorgo entonces).
 * Todo se convierte a la moneda de visualizacion con la cotizacion de ESA
 * fecha — igual que el resto de los totales consolidados.
 *
 * No incluye las deudas entre personas (no entran al patrimonio).
 */

import type { RateBook } from "./fx";
import type { Currency } from "./money";
import { monthBounds, monthKeyOf, shiftMonth } from "./dates";
import {
  holdingValueAt,
  type HoldingFlow,
  type HoldingSpec,
  type HoldingValuation,
  type PriceLookup,
} from "./investments";
import { outstandingAt, type AmortizationRow, type Prepayment } from "./loans";
import { addMonthsClamped } from "./recurrence";
import { consolidateBalances, type BalanceAccount } from "./reports";
import type { AccountType } from "./supabase/types";

export type NwAccount = {
  id: string;
  type: AccountType;
  currency: Currency;
  initialMinor: bigint;
};

export type NwTransaction = { accountId: string; date: string; amountMinor: bigint };

export type NwHolding = {
  id: string;
  currency: Currency;
  /** Como se valoriza (a mano, por unidades, deposito a plazo...). */
  spec: HoldingSpec;
  flows: HoldingFlow[];
  valuations: HoldingValuation[];
  /** Precio por unidad en cada fecha (metodos por unidades); null en el resto. */
  priceAt: PriceLookup | null;
};

export type NwLoan = {
  id: string;
  currency: Currency;
  principalMinor: bigint;
  firstDueDate: string;
  rows: AmortizationRow[];
  /** Abonos extraordinarios: bajan el capital desde su fecha. */
  prepayments?: Prepayment[];
};

export type NetWorthPoint = {
  date: string;
  assetsMinor: bigint;
  /** Negativo o cero. */
  liabilitiesMinor: bigint;
  netWorthMinor: bigint;
  /** Saldos que no se pudieron convertir por falta de cotizacion (quedan fuera). */
  unconverted: number;
};

/** Desde cuando se asume vigente un prestamo: un mes antes de su primera cuota. */
export function loanStartDate(firstDueDate: string): string {
  return addMonthsClamped(firstDueDate, -1);
}

/** Fecha mas antigua con actividad registrada; null si no hay nada. */
export function earliestActivity(args: {
  transactions: NwTransaction[];
  holdings: NwHolding[];
  loans: NwLoan[];
}): string | null {
  const dates: string[] = [];
  for (const tx of args.transactions) dates.push(tx.date);
  for (const holding of args.holdings) {
    for (const flow of holding.flows) dates.push(flow.occurredOn);
    for (const valuation of holding.valuations) dates.push(valuation.valuedOn);
  }
  for (const loan of args.loans) dates.push(loanStartDate(loan.firstDueDate));
  return dates.length === 0 ? null : dates.reduce((min, d) => (d < min ? d : min));
}

/**
 * Fechas de la curva: el cierre de cada mes completo desde `start` (o
 * desde hace `maxMonths` meses, lo que sea mas reciente) y, al final, hoy.
 * Si todo el historial cae en el mes en curso, solo queda hoy.
 */
export function seriesDates(start: string, today: string, maxMonths = 24): string[] {
  const currentMonth = monthKeyOf(today);
  const firstMonth = [monthKeyOf(start), shiftMonth(currentMonth, -maxMonths)]
    .sort()
    .at(-1)!;

  const dates: string[] = [];
  for (let month = firstMonth; month < currentMonth; month = shiftMonth(month, 1)) {
    dates.push(monthBounds(month).to);
  }
  dates.push(today);
  return dates;
}

/** Patrimonio neto en cada fecha de `dates` (en orden ascendente). */
export function netWorthSeries(args: {
  dates: string[];
  display: Currency;
  book: RateBook;
  accounts: NwAccount[];
  transactions: NwTransaction[];
  holdings: NwHolding[];
  loans: NwLoan[];
}): NetWorthPoint[] {
  const { dates, display, book, accounts, holdings, loans } = args;
  const transactions = [...args.transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  // Los saldos se acumulan avanzando por los movimientos ordenados: una
  // sola pasada para todas las fechas.
  const balances = new Map(accounts.map((a) => [a.id, a.initialMinor]));
  let next = 0;

  return dates.map((date) => {
    while (next < transactions.length && transactions[next].date <= date) {
      const tx = transactions[next++];
      if (balances.has(tx.accountId)) {
        balances.set(tx.accountId, balances.get(tx.accountId)! + tx.amountMinor);
      }
    }

    const items: BalanceAccount[] = accounts.map((account) => ({
      id: account.id,
      type: account.type,
      currency: account.currency,
      balanceMinor: balances.get(account.id) ?? 0n,
    }));

    for (const holding of holdings) {
      const { valueMinor } = holdingValueAt(
        holding.spec,
        holding.flows,
        holding.valuations,
        holding.priceAt,
        date,
      );
      if (valueMinor > 0n) {
        items.push({
          id: `holding:${holding.id}`,
          type: "investment",
          currency: holding.currency,
          balanceMinor: valueMinor,
        });
      }
    }

    for (const loan of loans) {
      if (date < loanStartDate(loan.firstDueDate)) continue;
      const outstanding = outstandingAt(
        loan.principalMinor,
        loan.rows,
        date,
        loan.prepayments,
      );
      if (outstanding > 0n) {
        items.push({
          id: `loan:${loan.id}`,
          type: "loan",
          currency: loan.currency,
          balanceMinor: -outstanding,
        });
      }
    }

    const total = consolidateBalances(items, display, book, date);
    return {
      date,
      assetsMinor: total.assetsMinor,
      liabilitiesMinor: total.liabilitiesMinor,
      netWorthMinor: total.netWorthMinor,
      unconverted: total.unconverted,
    };
  });
}
