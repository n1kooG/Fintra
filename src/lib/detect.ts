/**
 * Detector de cargos que se repiten sin haberlos declarado como
 * recurrentes (suscripciones) y de gastos hormiga (compras chicas y
 * frecuentes que pasan desapercibidas). Logica pura sobre gastos ya
 * convertidos a la moneda de visualizacion.
 *
 * Suscripcion = mismo comercio, cadencia regular (semanal, quincenal,
 * mensual o anual) y monto parecido. Hormiga = mismo comercio, compras
 * chicas, muchas veces, sin cadencia fija. Un comercio es lo uno o lo
 * otro, nunca ambos: lo regular se reporta como suscripcion.
 */

import { normalizeText } from "./categorization";
import { daysBetween } from "./dates";
import { addDays } from "./recurrence";

export type ExpenseRecord = {
  date: string;
  merchant: string;
  /** Positivo, en la moneda de visualizacion. */
  amountMinor: bigint;
  categoryName?: string | null;
};

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "semanal",
  biweekly: "quincenal",
  monthly: "mensual",
  yearly: "anual",
};

export const CADENCE_PER_YEAR: Record<Cadence, bigint> = {
  weekly: 52n,
  biweekly: 26n,
  monthly: 12n,
  yearly: 1n,
};

/** Rango de dias entre cargos consecutivos que corresponde a cada cadencia. */
const CADENCE_RANGE: Record<Cadence, [number, number]> = {
  weekly: [6, 8],
  biweekly: [13, 16],
  monthly: [26, 35],
  yearly: [350, 380],
};

/** Minimo de cargos para decir que algo es regular (anual: dos bastan, el ciclo es largo). */
const MIN_OCCURRENCES: Record<Cadence, number> = {
  weekly: 3,
  biweekly: 3,
  monthly: 3,
  yearly: 2,
};

/** Cuanto puede variar el monto (en %) alrededor de la mediana para seguir siendo "el mismo cargo". */
const AMOUNT_TOLERANCE_PERCENT = 15n;

export type DetectedCharge = {
  /** Comercio normalizado (sin tildes ni mayusculas). */
  key: string;
  /** Nombre tal como suele escribirse. */
  label: string;
  cadence: Cadence;
  count: number;
  lastDate: string;
  nextExpected: string;
  typicalMinor: bigint;
  annualizedMinor: bigint;
  categoryName: string | null;
};

function median<T extends number | bigint>(values: T[]): T {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function groupByMerchant(records: ExpenseRecord[]): Map<string, ExpenseRecord[]> {
  const groups = new Map<string, ExpenseRecord[]>();
  for (const record of records) {
    const key = normalizeText(record.merchant);
    if (!key || record.amountMinor <= 0n) continue;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return groups;
}

/** Varios cargos el mismo dia cuentan como uno solo (suma): el ritmo se mide entre dias distintos. */
function mergeSameDay(records: ExpenseRecord[]): { date: string; amountMinor: bigint }[] {
  const byDate = new Map<string, bigint>();
  for (const r of records) byDate.set(r.date, (byDate.get(r.date) ?? 0n) + r.amountMinor);
  return [...byDate.entries()]
    .map(([date, amountMinor]) => ({ date, amountMinor }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Cargos regulares: cadencia clara entre cargos consecutivos (al menos 70%
 * de los intervalos en el rango de la cadencia) y montos dentro de ±15%
 * de la mediana (al menos 80% de ellos).
 */
export function detectRecurringCharges(records: ExpenseRecord[]): DetectedCharge[] {
  const detected: DetectedCharge[] = [];

  for (const [key, group] of groupByMerchant(records)) {
    const days = mergeSameDay(group);
    if (days.length < 2) continue;

    const gaps = days.slice(1).map((d, i) => daysBetween(days[i].date, d.date));
    const medianGap = median(gaps);
    const cadence = (Object.keys(CADENCE_RANGE) as Cadence[]).find((c) => {
      const [low, high] = CADENCE_RANGE[c];
      return medianGap >= low && medianGap <= high;
    });
    if (!cadence || days.length < MIN_OCCURRENCES[cadence]) continue;

    const [low, high] = CADENCE_RANGE[cadence];
    const regularGaps = gaps.filter((g) => g >= low && g <= high).length;
    if (regularGaps * 100 < gaps.length * 70) continue;

    const typical = median(days.map((d) => d.amountMinor));
    const similar = days.filter(
      (d) =>
        (d.amountMinor > typical ? d.amountMinor - typical : typical - d.amountMinor) *
          100n <=
        typical * AMOUNT_TOLERANCE_PERCENT,
    ).length;
    if (BigInt(similar) * 100n < BigInt(days.length) * 80n) continue;

    const lastDate = days[days.length - 1].date;
    detected.push({
      key,
      label: mostCommon(group.map((r) => r.merchant.trim())),
      cadence,
      count: days.length,
      lastDate,
      nextExpected: addDays(lastDate, medianGap),
      typicalMinor: typical,
      annualizedMinor: typical * CADENCE_PER_YEAR[cadence],
      categoryName: group.find((r) => r.categoryName)?.categoryName ?? null,
    });
  }

  return detected.sort((a, b) =>
    b.annualizedMinor > a.annualizedMinor
      ? 1
      : b.annualizedMinor < a.annualizedMinor
        ? -1
        : 0,
  );
}

export type SmallSpending = {
  key: string;
  label: string;
  count: number;
  averageMinor: bigint;
  totalMinor: bigint;
  /** Lo que cuesta al mes al ritmo observado. */
  monthlyMinor: bigint;
  annualizedMinor: bigint;
};

/**
 * Gastos hormiga: en los ultimos `windowDays` dias, comercios con al
 * menos `minOccurrences` compras de monto <= `thresholdMinor`. Se
 * anualiza el ritmo observado en la ventana. `excludeKeys` deja afuera lo
 * que ya se detecto como suscripcion.
 */
export function detectSmallSpending(args: {
  records: ExpenseRecord[];
  today: string;
  thresholdMinor: bigint;
  windowDays?: number;
  minOccurrences?: number;
  excludeKeys?: Set<string>;
}): SmallSpending[] {
  const { records, today, thresholdMinor, excludeKeys } = args;
  const windowDays = args.windowDays ?? 90;
  const minOccurrences = args.minOccurrences ?? 4;
  const since = addDays(today, -windowDays);

  const recent = records.filter(
    (r) => r.date > since && r.date <= today && r.amountMinor <= thresholdMinor,
  );

  const result: SmallSpending[] = [];
  for (const [key, group] of groupByMerchant(recent)) {
    if (excludeKeys?.has(key) || group.length < minOccurrences) continue;
    const totalMinor = group.reduce((sum, r) => sum + r.amountMinor, 0n);
    result.push({
      key,
      label: mostCommon(group.map((r) => r.merchant.trim())),
      count: group.length,
      averageMinor: totalMinor / BigInt(group.length),
      totalMinor,
      monthlyMinor: (totalMinor * 30n) / BigInt(windowDays),
      annualizedMinor: (totalMinor * 365n) / BigInt(windowDays),
    });
  }

  return result.sort((a, b) =>
    b.annualizedMinor > a.annualizedMinor
      ? 1
      : b.annualizedMinor < a.annualizedMinor
        ? -1
        : 0,
  );
}
