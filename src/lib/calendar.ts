/**
 * Calendario financiero: arma los eventos de un rango de fechas (sueldos
 * y cargos recurrentes, cierres y vencimientos de tarjeta, cuotas de
 * prestamos) y la grilla del mes. Logica pura — las consultas viven en
 * src/server/queries/calendar.ts.
 *
 * El calendario muestra OBLIGACIONES e ingresos programados, no cada
 * gasto suelto: para eso esta el listado de Movimientos.
 */

import type { Currency } from "./money";
import { monthBounds, monthKeyOf, shiftMonth } from "./dates";
import { addDays, occurrencesBetween, type Frequency } from "./recurrence";
import {
  buildStatement,
  dateInMonth,
  planSchedule,
  statementPayment,
  type InstallmentPlan,
} from "./cards";
import type { AmortizationRow } from "./loans";

export type CalendarEventKind =
  "income" | "expense" | "card_close" | "card_billing" | "loan" | "deposit_maturity";

export type CalendarEvent = {
  id: string;
  date: string;
  kind: CalendarEventKind;
  label: string;
  /** Con signo (ingreso +, egreso -). null para eventos sin monto, como el cierre de una tarjeta. */
  amountMinor: bigint | null;
  currency: Currency;
  /** true si el monto aun puede cambiar (ciclo de tarjeta abierto). */
  estimated: boolean;
};

const KIND_ORDER: Record<CalendarEventKind, number> = {
  income: 0,
  card_close: 1,
  card_billing: 2,
  loan: 3,
  deposit_maturity: 4,
  expense: 5,
};

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.label.localeCompare(b.label, "es"),
  );
}

export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of sortEvents(events)) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return map;
}

/** Semanas del mes, lunes a domingo; los dias fuera del mes son null. */
export function monthGrid(monthKey: string): (string | null)[][] {
  const { from, to } = monthBounds(monthKey);
  const [year, month] = monthKey.split("-").map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (sundayFirst + 6) % 7;
  const lastDay = Number(to.slice(8, 10));

  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= lastDay; day++) {
    cells.push(`${from.slice(0, 8)}${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Los 7 dias (lunes a domingo) de la semana que contiene `date`. */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const sundayFirst = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const monday = addDays(date, -((sundayFirst + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// --- Recurrentes -------------------------------------------------------------

export type RecurringInput = {
  id: string;
  type: "income" | "expense";
  label: string;
  /** Magnitud positiva. */
  amountMinor: bigint;
  currency: Currency;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  nextRunOn: string;
  active: boolean;
};

/** Movimiento ya generado por una regla (fecha pasada o de hoy). */
export type GeneratedInput = {
  id: string;
  date: string;
  type: "income" | "expense";
  label: string;
  /** Con signo, tal como esta guardado. */
  amountMinor: bigint;
  currency: Currency;
};

/**
 * Lo ya generado sale de los movimientos reales; lo que viene, de las
 * reglas activas a partir de su proxima fecha. Asi nada se cuenta dos
 * veces, y una regla pausada no proyecta fechas que no van a ocurrir.
 */
export function recurringEvents(args: {
  rules: RecurringInput[];
  generated: GeneratedInput[];
  from: string;
  to: string;
}): CalendarEvent[] {
  const { rules, generated, from, to } = args;
  const events: CalendarEvent[] = generated
    .filter((tx) => inRange(tx.date, from, to))
    .map((tx) => ({
      id: `tx:${tx.id}`,
      date: tx.date,
      kind: tx.type,
      label: tx.label,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      estimated: false,
    }));

  for (const rule of rules) {
    if (!rule.active) continue;
    const start = rule.nextRunOn > from ? rule.nextRunOn : from;
    const dates = occurrencesBetween(
      { startDate: rule.startDate, frequency: rule.frequency, endDate: rule.endDate },
      start,
      to,
    );
    for (const date of dates) {
      events.push({
        id: `rule:${rule.id}:${date}`,
        date,
        kind: rule.type,
        label: rule.label,
        amountMinor: rule.type === "expense" ? -rule.amountMinor : rule.amountMinor,
        currency: rule.currency,
        estimated: false,
      });
    }
  }
  return events;
}

// --- Tarjetas ----------------------------------------------------------------

export type CardInput = {
  id: string;
  name: string;
  currency: Currency;
  closeDay: number | null;
  dueDay: number | null;
};

export type PlanInput = InstallmentPlan & { id: string; accountId: string };

/** Compra de contado en una tarjeta (monto positivo), fuera de planes de cuotas. */
export type ChargeInput = { accountId: string; date: string; amountMinor: bigint };

/** Pago a una tarjeta: una transferencia que entra a su cuenta (monto positivo). */
export type CardPaymentInput = { accountId: string; date: string; amountMinor: bigint };

/**
 * Cierre y facturacion de cada tarjeta configurada. La facturacion de un
 * ciclo abierto o futuro es una estimacion: solo conoce las cuotas ya
 * agendadas y las compras de contado hechas hasta hoy.
 */
export function cardEvents(args: {
  cards: CardInput[];
  plans: PlanInput[];
  charges: ChargeInput[];
  /** Pagos ya hechos a las tarjetas: una facturacion pagada deja de aparecer como pendiente. */
  payments?: CardPaymentInput[];
  from: string;
  to: string;
  today: string;
}): CalendarEvent[] {
  const { cards, plans, charges, from, to, today } = args;
  const payments = args.payments ?? [];
  const events: CalendarEvent[] = [];

  for (const card of cards) {
    if (card.closeDay === null || card.dueDay === null) continue;
    const days = { closeDay: card.closeDay, dueDay: card.dueDay };
    const schedules = plans.filter((p) => p.accountId === card.id).map(planSchedule);
    const cardCharges = charges
      .filter((c) => c.accountId === card.id)
      .map(({ date, amountMinor }) => ({ date, amountMinor }));

    const lastMonth = shiftMonth(monthKeyOf(to), 1);
    for (
      let month = shiftMonth(monthKeyOf(from), -1);
      month <= lastMonth;
      month = shiftMonth(month, 1)
    ) {
      const closeDate = dateInMonth(month, days.closeDay);
      const statement = buildStatement({
        closeDate,
        days,
        charges: cardCharges,
        schedules,
        today,
      });

      if (inRange(closeDate, from, to)) {
        events.push({
          id: `close:${card.id}:${closeDate}`,
          date: closeDate,
          kind: "card_close",
          label: `Cierre ${card.name}`,
          amountMinor: null,
          currency: card.currency,
          estimated: false,
        });
      }
      if (inRange(statement.dueDate, from, to) && statement.totalMinor > 0n) {
        // Un estado de cuenta ya cerrado puede estar pagado, total o parcialmente.
        const paid = statement.closed
          ? statementPayment(
              statement,
              payments
                .filter((p) => p.accountId === card.id)
                .map(({ date, amountMinor }) => ({ date, amountMinor })),
            )
          : null;
        if (paid?.status !== "paid") {
          events.push({
            id: `bill:${card.id}:${statement.dueDate}`,
            date: statement.dueDate,
            kind: "card_billing",
            label: `Facturación ${card.name}`,
            amountMinor: -(paid ? paid.remainingMinor : statement.totalMinor),
            currency: card.currency,
            estimated: !statement.closed,
          });
        }
      }
    }
  }
  return events;
}

// --- Depositos a plazo -------------------------------------------------------

export type MaturityInput = {
  id: string;
  name: string;
  currency: Currency;
  /** Fecha de vencimiento. */
  end: string;
  /** Capital + interes al vencer. */
  totalMinor: bigint;
};

/**
 * Vencimiento de cada deposito a plazo: capital mas interes que se recibe.
 * Es informativo (positivo = plata que vuelve a ti); NO entra a la proyeccion
 * de caja porque no es dinero liquido hasta que lo cobras y lo depositas.
 */
export function maturityEvents(args: {
  deposits: MaturityInput[];
  from: string;
  to: string;
}): CalendarEvent[] {
  return args.deposits
    .filter((d) => inRange(d.end, args.from, args.to))
    .map((d) => ({
      id: `maturity:${d.id}:${d.end}`,
      date: d.end,
      kind: "deposit_maturity" as const,
      label: `Vence ${d.name}`,
      amountMinor: d.totalMinor,
      currency: d.currency,
      estimated: false,
    }));
}

// --- Prestamos ---------------------------------------------------------------

export type LoanInput = {
  id: string;
  name: string;
  currency: Currency;
  rows: AmortizationRow[];
};

export function loanEvents(args: {
  loans: LoanInput[];
  from: string;
  to: string;
}): CalendarEvent[] {
  const { loans, from, to } = args;
  return loans.flatMap((loan) =>
    loan.rows
      .filter((row) => inRange(row.dueDate, from, to))
      .map((row) => ({
        id: `loan:${loan.id}:${row.number}`,
        date: row.dueDate,
        kind: "loan" as const,
        label: `Cuota ${loan.name} (${row.number}/${loan.rows.length})`,
        amountMinor: -row.installmentMinor,
        currency: loan.currency,
        estimated: false,
      })),
  );
}
