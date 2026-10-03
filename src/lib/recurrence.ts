/**
 * Motor de repeticion de movimientos recurrentes (sueldo, arriendo,
 * suscripciones). Logica pura sobre fechas "yyyy-mm-dd" — sin zona
 * horaria ni hora del dia, que es exactamente la granularidad de
 * transactions.occurred_on.
 *
 * Cada ocurrencia se calcula desde la fecha de inicio (inicio + n
 * periodos), nunca sumando un periodo a la ocurrencia anterior: asi una
 * regla mensual del 31 cae el 28/29 en febrero y VUELVE al 31 en marzo,
 * en vez de quedarse corrida al 28 para siempre.
 */

export const FREQUENCIES = ["weekly", "biweekly", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Semanal",
  biweekly: "Cada 2 semanas",
  monthly: "Mensual",
  yearly: "Anual",
};

export type RecurrenceRule = {
  startDate: string;
  frequency: Frequency;
  /** Ultimo dia en que puede ocurrir (inclusive), o null si no termina. */
  endDate: string | null;
};

/** Tope de ocurrencias por corrida, para que una fecha de inicio muy antigua no genere cientos de movimientos de golpe. */
export const MAX_OCCURRENCES_PER_RUN = 60;

const MAX_ITERATIONS = 20_000;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Suma meses conservando el dia, recortado al ultimo dia del mes destino. */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const zeroBased = m - 1 + months;
  const year = y + Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  return toISO(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Ocurrencia numero `index` (0 = la fecha de inicio). */
export function occurrenceAt(rule: RecurrenceRule, index: number): string {
  switch (rule.frequency) {
    case "weekly":
      return addDays(rule.startDate, 7 * index);
    case "biweekly":
      return addDays(rule.startDate, 14 * index);
    case "monthly":
      return addMonthsClamped(rule.startDate, index);
    case "yearly":
      return addMonthsClamped(rule.startDate, 12 * index);
  }
}

/** Todas las ocurrencias dentro de [from, to], ambos inclusive, respetando endDate. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: string,
  to: string,
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const result: string[] = [];
  for (let i = 0; i < MAX_ITERATIONS && result.length < limit; i++) {
    const date = occurrenceAt(rule, i);
    if (date > to || (rule.endDate && date > rule.endDate)) break;
    if (date >= from) result.push(date);
  }
  return result;
}

/** Primera ocurrencia estrictamente posterior a `after`, o null si la regla ya termino. */
export function nextOccurrenceAfter(rule: RecurrenceRule, after: string): string | null {
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const date = occurrenceAt(rule, i);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > after) return date;
  }
  return null;
}

/**
 * Que movimientos hay que generar hoy para una regla, y cual queda como
 * su proxima fecha. `nextRunOn` es la primera ocurrencia todavia no
 * generada; la nueva es la siguiente a la ultima generada. Si se llego
 * al tope por corrida, esa fecha puede seguir siendo pasada — la
 * proxima corrida retoma desde ahi en vez de saltearse las del medio.
 *
 * `nextRunOn: null` significa que la regla termino (paso su endDate).
 */
export function dueOccurrences(
  rule: RecurrenceRule & { nextRunOn: string },
  today: string,
): { dates: string[]; nextRunOn: string | null } {
  const dates = occurrencesBetween(rule, rule.nextRunOn, today, MAX_OCCURRENCES_PER_RUN);
  const last = dates.at(-1);
  if (last === undefined) return { dates, nextRunOn: rule.nextRunOn };
  return { dates, nextRunOn: nextOccurrenceAfter(rule, last) };
}
