/**
 * Tarjetas de credito: ciclo de facturacion (cierre y vencimiento), cupo
 * disponible y compras en cuotas. Logica pura sobre fechas "yyyy-mm-dd"
 * y montos bigint — las consultas viven en src/server/queries/cards.ts.
 *
 * Modelo de las cuotas: una compra en N cuotas se registra UNA vez, por
 * el monto total, en la cuenta de la tarjeta (asi el saldo y el cupo
 * reflejan toda la deuda de inmediato). El plan de cuotas solo dice
 * cuanto se factura cada mes. Son cuotas SIN interes: cuota = total / N,
 * con los pesos sobrantes repartidos de a uno en las primeras cuotas.
 *
 * Supuestos del ciclo (los de la mayoria de los emisores chilenos):
 * - Una compra hecha hasta el dia de cierre INCLUSIVE entra al estado de
 *   cuenta de ese cierre.
 * - Ese estado de cuenta vence el primer dia de pago posterior al cierre
 *   (cierra el 22 y paga el 5 -> vence el 5 del mes siguiente).
 * - La primera cuota se cobra en ese vencimiento; las demas, una por mes.
 * - Un dia 29, 30 o 31 en un mes mas corto cae el ultimo dia del mes.
 */

import { monthBounds, monthKeyOf, shiftMonth } from "./dates";
import { addDays } from "./recurrence";

/** Fecha del dia `day` en el mes "yyyy-mm", recortada al ultimo dia si el mes es mas corto. */
export function dateInMonth(monthKey: string, day: number): string {
  const lastDay = Number(monthBounds(monthKey).to.slice(8, 10));
  return `${monthKey}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Primer dia de cierre en o despues de `date` (el cierre de la fecha misma cuenta). */
export function closeDateOnOrAfter(date: string, closeDay: number): string {
  const month = monthKeyOf(date);
  const candidate = dateInMonth(month, closeDay);
  return candidate >= date ? candidate : dateInMonth(shiftMonth(month, 1), closeDay);
}

/** Ultimo dia de cierre estrictamente anterior a `date`. */
export function closeDateBefore(date: string, closeDay: number): string {
  const month = monthKeyOf(date);
  const candidate = dateInMonth(month, closeDay);
  return candidate < date ? candidate : dateInMonth(shiftMonth(month, -1), closeDay);
}

/** Vencimiento del estado de cuenta que cierra en `closeDate`: el primer dia de pago posterior. */
export function dueDateAfter(closeDate: string, dueDay: number): string {
  const month = monthKeyOf(closeDate);
  const candidate = dateInMonth(month, dueDay);
  return candidate > closeDate ? candidate : dateInMonth(shiftMonth(month, 1), dueDay);
}

/** Cuando se cobra la primera cuota de una compra hecha el `purchaseDate`. */
export function firstInstallmentDueDate(
  purchaseDate: string,
  closeDay: number,
  dueDay: number,
): string {
  return dueDateAfter(closeDateOnOrAfter(purchaseDate, closeDay), dueDay);
}

/** Reparte el total en `count` cuotas; los pesos que sobran van de a uno a las primeras. */
export function splitInstallments(totalMinor: bigint, count: number): bigint[] {
  const n = BigInt(count);
  const base = totalMinor / n;
  const extra = Number(totalMinor % n);
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1n : 0n));
}

export type InstallmentPlan = {
  totalMinor: bigint;
  count: number;
  /** Vencimiento de la primera cuota; las siguientes caen el mismo dia de pago, un mes despues. */
  firstDueDate: string;
  dueDay: number;
};

export type InstallmentEntry = { number: number; dueDate: string; amountMinor: bigint };

/** Calendario completo de cuotas de un plan. */
export function planSchedule(plan: InstallmentPlan): InstallmentEntry[] {
  const amounts = splitInstallments(plan.totalMinor, plan.count);
  const firstMonth = monthKeyOf(plan.firstDueDate);
  return amounts.map((amountMinor, i) => ({
    number: i + 1,
    dueDate:
      i === 0 ? plan.firstDueDate : dateInMonth(shiftMonth(firstMonth, i), plan.dueDay),
    amountMinor,
  }));
}

export type PlanProgress = {
  /** Cuotas con vencimiento anterior a hoy (ya cobradas). */
  paidCount: number;
  remainingCount: number;
  remainingMinor: bigint;
  /** Proxima cuota por cobrar (la que vence hoy o despues); null si el plan termino. */
  next: InstallmentEntry | null;
};

/** Una cuota que vence hoy todavia cuenta como pendiente. */
export function planProgress(schedule: InstallmentEntry[], today: string): PlanProgress {
  const pending = schedule.filter((entry) => entry.dueDate >= today);
  return {
    paidCount: schedule.length - pending.length,
    remainingCount: pending.length,
    remainingMinor: pending.reduce((sum, entry) => sum + entry.amountMinor, 0n),
    next: pending[0] ?? null,
  };
}

/**
 * Cupo disponible = cupo - deuda. Un saldo a favor no sube el cupo por
 * encima del limite. Puede ser negativo si la tarjeta esta sobregirada.
 */
export function availableCredit(
  limitMinor: bigint | null,
  balanceMinor: bigint,
): bigint | null {
  if (limitMinor === null) return null;
  return limitMinor + (balanceMinor < 0n ? balanceMinor : 0n);
}

export type CardDays = { closeDay: number; dueDay: number };

/** Compra de contado en la tarjeta (monto positivo), fuera de cualquier plan de cuotas. */
export type Charge = { date: string; amountMinor: bigint };

export type Statement = {
  closeDate: string;
  dueDate: string;
  /** Primer dia que cubre el estado de cuenta (el dia despues del cierre anterior). */
  periodStart: string;
  /** Compras de contado del periodo. */
  singlesMinor: bigint;
  /** Cuotas de planes que se cobran en este vencimiento. */
  installmentsMinor: bigint;
  totalMinor: bigint;
  /** false mientras el ciclo sigue abierto: faltan compras por venir y el total es una estimacion. */
  closed: boolean;
};

export function buildStatement(args: {
  closeDate: string;
  days: CardDays;
  charges: Charge[];
  schedules: InstallmentEntry[][];
  today: string;
}): Statement {
  const { closeDate, days, charges, schedules, today } = args;
  const previousClose = closeDateBefore(closeDate, days.closeDay);
  const periodStart = addDays(previousClose, 1);
  const dueDate = dueDateAfter(closeDate, days.dueDay);
  // Las cuotas se asignan por ventana de vencimiento (y no por fecha exacta)
  // para que un cambio posterior del dia de pago no deje cuotas huerfanas.
  const previousDue = dueDateAfter(previousClose, days.dueDay);

  const singlesMinor = charges
    .filter((c) => c.date >= periodStart && c.date <= closeDate)
    .reduce((sum, c) => sum + c.amountMinor, 0n);
  const installmentsMinor = schedules
    .flat()
    .filter((entry) => entry.dueDate > previousDue && entry.dueDate <= dueDate)
    .reduce((sum, entry) => sum + entry.amountMinor, 0n);

  return {
    closeDate,
    dueDate,
    periodStart,
    singlesMinor,
    installmentsMinor,
    totalMinor: singlesMinor + installmentsMinor,
    closed: closeDate < today,
  };
}

/** Pago a la tarjeta: una transferencia que entra a su cuenta (monto positivo). */
export type Payment = { date: string; amountMinor: bigint };

export type PaymentStatus = {
  /** Lo pagado entre el cierre y el vencimiento de este estado de cuenta. */
  paidMinor: bigint;
  status: "paid" | "partial" | "unpaid";
  /** Lo que falta para cubrir el total (0 si esta pagado). */
  remainingMinor: bigint;
};

/**
 * ¿Se pago este estado de cuenta? Cuentan los pagos hechos DESPUES del cierre
 * y hasta el dia de vencimiento (un pago anterior al cierre baja la deuda del
 * ciclo siguiente, no de este). Null si el estado de cuenta no tiene nada que
 * pagar. Solo tiene sentido para estados ya cerrados.
 */
export function statementPayment(
  statement: Statement,
  payments: Payment[],
): PaymentStatus | null {
  if (statement.totalMinor <= 0n) return null;
  const paidMinor = payments
    .filter((p) => p.date > statement.closeDate && p.date <= statement.dueDate)
    .reduce((sum, p) => sum + p.amountMinor, 0n);
  const remainingMinor =
    statement.totalMinor > paidMinor ? statement.totalMinor - paidMinor : 0n;
  return {
    paidMinor,
    remainingMinor,
    status: paidMinor <= 0n ? "unpaid" : remainingMinor === 0n ? "paid" : "partial",
  };
}

/**
 * Los dos estados de cuenta que importan hoy: el ya cerrado que todavia
 * no vence (`billed`, si hay) y el ciclo abierto (`open`).
 */
export function currentStatements(args: {
  today: string;
  days: CardDays;
  charges: Charge[];
  schedules: InstallmentEntry[][];
}): { billed: Statement | null; open: Statement } {
  const { today, days } = args;
  const openClose = closeDateOnOrAfter(today, days.closeDay);
  const open = buildStatement({ ...args, closeDate: openClose });

  const previousClose = closeDateBefore(openClose, days.closeDay);
  const previous = buildStatement({ ...args, closeDate: previousClose });
  return { billed: previous.dueDate >= today ? previous : null, open };
}
