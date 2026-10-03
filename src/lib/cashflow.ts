/**
 * Proyeccion de flujo de caja: cuanto efectivo tendrias dia a dia (y mes
 * a mes) si todo sigue como esta programado. Logica pura — los datos los
 * arma src/server/queries/cashflow.ts.
 *
 * Que entra a la cuenta:
 * - Saldo inicial: lo LIQUIDO de hoy (efectivo, corriente, vista y
 *   ahorro). No cuentan inversiones, ni tarjetas ni prestamos.
 * - Comprometido: ingresos y gastos recurrentes que vienen, cuotas de
 *   prestamos y la facturacion de tarjetas (cuotas ya agendadas mas las
 *   compras de contado que ya estan en un estado de cuenta).
 * - Variable: lo que se suele gastar sin estar programado, estimado con
 *   el promedio de los ultimos meses completos y repartido dia a dia.
 *
 * Es una estimacion, no una promesa: no sabe de ingresos o gastos que no
 * estan en recurrentes, y asume que cada vencimiento se paga en su fecha.
 */

import { daysBetween, monthBounds, monthKeyOf, shiftMonth } from "./dates";
import { addDays } from "./recurrence";
import type { CalendarEvent } from "./calendar";

export type VariableEstimate = {
  /** Gasto variable mensual estimado (positivo). */
  monthlyMinor: bigint;
  /** Con que se calculo: meses completos, el mes en curso (prorrateado) o nada. */
  basis: "full_months" | "current_month" | "none";
  /** Cuantos meses completos entraron al promedio. */
  months: number;
};

/**
 * Estima el gasto variable mensual. `totalsByMonth` trae el gasto variable
 * (positivo) de cada mes con movimientos. Se promedian los ultimos
 * `window` meses completos desde que hay datos; si el primer mes con datos
 * es probablemente parcial (el usuario empezo a mitad de mes) y hay otros,
 * no se usa. Sin ningun mes completo, se prorratea el mes en curso.
 */
export function estimateVariableMonthly(args: {
  totalsByMonth: Map<string, bigint>;
  today: string;
  window?: number;
}): VariableEstimate {
  const { totalsByMonth, today, window = 3 } = args;
  const currentMonth = monthKeyOf(today);
  const keys = [...totalsByMonth.keys()].sort();
  const firstDataMonth = keys[0];

  if (firstDataMonth !== undefined) {
    let candidates = Array.from({ length: window }, (_, i) =>
      shiftMonth(currentMonth, -(window - i)),
    ).filter((month) => month >= firstDataMonth);
    if (candidates.length >= 2 && candidates[0] === firstDataMonth) {
      candidates = candidates.slice(1);
    }
    if (candidates.length > 0) {
      const total = candidates.reduce((sum, m) => sum + (totalsByMonth.get(m) ?? 0n), 0n);
      return {
        monthlyMinor: total / BigInt(candidates.length),
        basis: "full_months",
        months: candidates.length,
      };
    }
  }

  const spentThisMonth = totalsByMonth.get(currentMonth) ?? 0n;
  if (spentThisMonth > 0n) {
    const elapsed = Number(today.slice(8, 10));
    const daysInMonth = Number(monthBounds(currentMonth).to.slice(8, 10));
    return {
      monthlyMinor: (spentThisMonth * BigInt(daysInMonth)) / BigInt(elapsed),
      basis: "current_month",
      months: 0,
    };
  }
  return { monthlyMinor: 0n, basis: "none", months: 0 };
}

/** Escenarios de la proyeccion: cuanto mas o menos se gasta en lo variable. */
export const SCENARIO_PERCENTS = [-20, -10, 0, 10, 20] as const;

/** Lee el escenario de la URL; cualquier cosa fuera de la lista vale 0 (sin cambio). */
export function parseScenario(value: string | undefined): number {
  const n = Number(value);
  return (SCENARIO_PERCENTS as readonly number[]).includes(n) ? n : 0;
}

/** Gasto variable mensual bajo un escenario (p. ej. +10 = gastar un 10% mas), en enteros. */
export function scaleVariable(monthlyMinor: bigint, percent: number): bigint {
  return (monthlyMinor * BigInt(100 + percent)) / 100n;
}

/** Evento de caja ya en la moneda de visualizacion: ingreso (+) o egreso (-). */
export type CashEvent = {
  id: string;
  date: string;
  kind: CalendarEvent["kind"];
  amountMinor: bigint;
};

/**
 * Solo lo que todavia no esta en el saldo de hoy: lo posterior a hoy y,
 * del mismo dia, los vencimientos de tarjeta y prestamo (lo recurrente de
 * hoy ya se genero como movimiento real). Sin monto no hay flujo (los
 * cierres de tarjeta).
 */
export function pendingCashEvents(
  events: CalendarEvent[],
  today: string,
  convert: (event: CalendarEvent) => bigint | null,
): CashEvent[] {
  const result: CashEvent[] = [];
  for (const event of events) {
    if (event.amountMinor === null) continue;
    // Un deposito que vence no es plata liquida hasta que se cobra y se deposita en una cuenta.
    if (event.kind === "deposit_maturity") continue;
    const dueToday =
      event.date === today && (event.kind === "card_billing" || event.kind === "loan");
    if (event.date <= today && !dueToday) continue;
    const amountMinor = convert(event);
    if (amountMinor === null) continue;
    result.push({ id: event.id, date: event.date, kind: event.kind, amountMinor });
  }
  return result;
}

/**
 * Las facturaciones de una tarjeta nunca pueden sumar mas de lo que hoy
 * se le debe: todo lo conocido (cuotas, compras ya facturadas) ya esta
 * dentro de ese saldo. Si el usuario adelanto un pago, la deuda es menor
 * que el estado de cuenta y recortar evita descontar dos veces. Las
 * facturaciones se recortan en orden de fecha; el evento que cruza el tope
 * se reduce y los siguientes quedan en cero (se descartan).
 */
export function capCardBillings(
  events: CashEvent[],
  owedByCard: Map<string, bigint>,
): CashEvent[] {
  const remaining = new Map(owedByCard);
  const ordered = [...events].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const result: CashEvent[] = [];

  for (const event of ordered) {
    if (event.kind !== "card_billing") {
      result.push(event);
      continue;
    }
    const cardId = event.id.split(":")[1];
    const left = remaining.get(cardId);
    if (left === undefined) {
      result.push(event); // tarjeta sin dato de deuda: se deja tal cual
      continue;
    }
    const amount = -event.amountMinor; // positivo
    const paid = amount < left ? amount : left;
    if (paid > 0n) result.push({ ...event, amountMinor: -paid });
    remaining.set(cardId, left - paid);
  }
  return result;
}

export type ProjectionMonth = {
  monthKey: string;
  /** Ingresos programados del tramo proyectado. */
  incomeMinor: bigint;
  /** Egresos programados (positivo). */
  committedMinor: bigint;
  /** Gasto variable estimado (positivo). */
  variableMinor: bigint;
  netMinor: bigint;
  endBalanceMinor: bigint;
  lowestBalanceMinor: bigint;
  lowestOn: string;
  /** true si en algun dia del mes el saldo proyectado baja de cero. */
  short: boolean;
};

export type Projection = {
  startingBalanceMinor: bigint;
  months: ProjectionMonth[];
  /** Primer dia en que el saldo proyectado queda bajo cero; null si no ocurre. */
  firstShortfall: { date: string; monthKey: string; balanceMinor: bigint } | null;
};

/**
 * Simula dia a dia desde manana hasta el fin del mes `monthsAhead` meses
 * despues del actual. El primer mes cubre solo lo que falta del mes en
 * curso. El gasto variable se reparte parejo por dia (el resto de la
 * division cae el ultimo dia del mes, para que sume exacto).
 */
export function projectCashFlow(args: {
  today: string;
  monthsAhead?: number;
  startingBalanceMinor: bigint;
  events: CashEvent[];
  variableMonthlyMinor: bigint;
}): Projection {
  const { today, startingBalanceMinor, events, variableMonthlyMinor } = args;
  const monthsAhead = args.monthsAhead ?? 6;
  const lastDate = monthBounds(shiftMonth(monthKeyOf(today), monthsAhead)).to;

  const eventsByDate = new Map<string, bigint[]>();
  for (const event of events) {
    if (event.date <= today || event.date > lastDate) continue;
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event.amountMinor);
    eventsByDate.set(event.date, list);
  }

  const months: ProjectionMonth[] = [];
  let balance = startingBalanceMinor;
  let firstShortfall: Projection["firstShortfall"] = null;
  let current: ProjectionMonth | null = null;

  for (
    let offset = 1, date = addDays(today, 1);
    date <= lastDate;
    offset++, date = addDays(today, offset)
  ) {
    const monthKey = monthKeyOf(date);
    if (!current || current.monthKey !== monthKey) {
      current = {
        monthKey,
        incomeMinor: 0n,
        committedMinor: 0n,
        variableMinor: 0n,
        netMinor: 0n,
        endBalanceMinor: balance,
        lowestBalanceMinor: balance,
        lowestOn: date,
        short: false,
      };
      months.push(current);
    }

    for (const amount of eventsByDate.get(date) ?? []) {
      balance += amount;
      if (amount > 0n) current.incomeMinor += amount;
      else current.committedMinor -= amount;
    }

    const daysInMonth = BigInt(
      daysBetween(monthBounds(monthKey).from, monthBounds(monthKey).to) + 1,
    );
    const base = variableMonthlyMinor / daysInMonth;
    const isLastDay = date === monthBounds(monthKey).to;
    const variable = isLastDay ? variableMonthlyMinor - base * (daysInMonth - 1n) : base;
    balance -= variable;
    current.variableMinor += variable;

    current.endBalanceMinor = balance;
    if (balance < current.lowestBalanceMinor) {
      current.lowestBalanceMinor = balance;
      current.lowestOn = date;
    }
    if (balance < 0n) {
      current.short = true;
      if (!firstShortfall) firstShortfall = { date, monthKey, balanceMinor: balance };
    }
  }

  for (const month of months) {
    month.netMinor = month.incomeMinor - month.committedMinor - month.variableMinor;
  }
  return { startingBalanceMinor, months, firstShortfall };
}
