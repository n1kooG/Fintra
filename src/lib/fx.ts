/**
 * Conversion entre monedas con cotizacion historica — nucleo critico,
 * igual que src/lib/money.ts.
 *
 * Convencion: toda cotizacion es "cuantos CLP vale 1 unidad de la
 * moneda" (USD 959,39 · UF 41.008,10 · UTM 71.721), que es como la
 * publica mindicador.cl. El CLP vale 1 contra si mismo y nunca necesita
 * cotizacion.
 *
 * Las cotizaciones se operan como `bigint` escalado por RATE_SCALE (6
 * decimales, igual que la columna numeric(18,6) de la base), asi la
 * conversion completa es aritmetica entera y solo se redondea una vez,
 * al final.
 */

import { CURRENCY_CONFIG, type Currency } from "./money";

export const RATE_SCALE = 1_000_000n;
const RATE_DECIMALS = 6;

/** Cotizacion escalada: 959.39 -> 959390000n. */
export type ScaledRate = bigint;

/**
 * Parsea una cotizacion ("959.39", "41008.1", 71721) a su forma
 * escalada. Acepta el string que devuelve Postgres para una columna
 * numeric, o el number que viene de la API. Devuelve null si no es un
 * numero positivo valido.
 */
export function parseRate(value: string | number | null | undefined): ScaledRate | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "number" ? value.toFixed(RATE_DECIMALS) : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) return null;

  const [, intPart, fracPart = ""] = match;
  const frac = fracPart.slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, "0");
  const scaled = BigInt(intPart) * RATE_SCALE + BigInt(frac);
  return scaled > 0n ? scaled : null;
}

/** Forma decimal de una cotizacion escalada, para guardarla en numeric(18,6). */
export function formatRate(rate: ScaledRate): string {
  const intPart = rate / RATE_SCALE;
  const fracPart = (rate % RATE_SCALE).toString().padStart(RATE_DECIMALS, "0");
  return `${intPart}.${fracPart}`;
}

/** Division entera redondeando la mitad hacia afuera del cero (simetrica para negativos). */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division por cero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n + d / 2n) / d;
  return negative ? -q : q;
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * Convierte un monto entre dos monedas. `fromRate` y `toRate` son las
 * cotizaciones contra CLP de cada moneda (se ignoran para CLP). La
 * formula va directo de una moneda a la otra, sin pasar por pesos
 * enteros en el medio, para no perder precision en USD <-> UF.
 *
 * `precision` devuelve el resultado en unidades minimas multiplicadas
 * por ese factor: para sumar muchas conversiones y redondear UNA sola
 * vez al final (ver src/lib/reports.ts), en vez de acumular el error de
 * redondear cada sumando.
 */
export function convertMinor(
  amountMinor: bigint,
  from: Currency,
  to: Currency,
  fromRate: ScaledRate | null,
  toRate: ScaledRate | null,
  precision: bigint = 1n,
): bigint {
  if (from === to) return amountMinor * precision;

  const rFrom = from === "CLP" ? RATE_SCALE : fromRate;
  const rTo = to === "CLP" ? RATE_SCALE : toRate;
  if (!rFrom || !rTo) {
    throw new RangeError(`Falta la cotizacion para convertir ${from} a ${to}`);
  }

  const fromUnits = pow10(CURRENCY_CONFIG[from].minorUnits);
  const toUnits = pow10(CURRENCY_CONFIG[to].minorUnits);
  return divRound(amountMinor * rFrom * toUnits * precision, fromUnits * rTo);
}

export type RateRow = { date: string; currency: Currency; rate: ScaledRate };

/**
 * Libro de cotizaciones en memoria: responde "cual era la cotizacion de
 * X el dia D", usando la ultima publicada en o antes de D (el dolar no
 * se publica fines de semana ni feriados; la UTM es una por mes).
 */
export class RateBook {
  private readonly byCurrency = new Map<Currency, RateRow[]>();

  constructor(rows: RateRow[]) {
    for (const row of rows) {
      if (row.currency === "CLP") continue;
      const list = this.byCurrency.get(row.currency) ?? [];
      list.push(row);
      this.byCurrency.set(row.currency, list);
    }
    for (const list of this.byCurrency.values()) {
      list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
  }

  /** Cotizacion vigente el dia `dateISO` (yyyy-mm-dd), o null si no hay ninguna anterior. */
  rateOn(currency: Currency, dateISO: string): ScaledRate | null {
    if (currency === "CLP") return RATE_SCALE;
    const list = this.byCurrency.get(currency);
    if (!list || list.length === 0) return null;

    // Busqueda binaria de la ultima fecha <= dateISO.
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= dateISO) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found === -1 ? null : list[found].rate;
  }

  /** Ultima cotizacion conocida en o antes de `dateISO`, con su fecha (para mostrarla). */
  latest(currency: Currency, dateISO: string): { date: string; rate: ScaledRate } | null {
    if (currency === "CLP") return null;
    const list = this.byCurrency.get(currency) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].date <= dateISO) return { date: list[i].date, rate: list[i].rate };
    }
    return null;
  }
}

type ConvertibleAmount = {
  amountMinor: bigint;
  currency: Currency;
  occurredOn: string;
  /** Cotizacion congelada al guardar el movimiento (null si no se pudo obtener). */
  frozenRate: ScaledRate | null;
};

/**
 * Convierte un movimiento a la moneda de visualizacion con la cotizacion
 * DE SU FECHA: primero la congelada en el movimiento, y si no la tiene
 * (movimientos anteriores a la Fase 2, o sin conexion al guardar), la
 * del libro en esa fecha. Devuelve null si no hay forma de convertirlo
 * — quien llama lo cuenta como "sin cotizacion" en vez de sumarlo mal.
 */
export function convertAtDate(
  item: ConvertibleAmount,
  target: Currency,
  book: RateBook,
  precision: bigint = 1n,
): bigint | null {
  if (item.currency === target) return item.amountMinor * precision;

  const fromRate =
    item.currency === "CLP"
      ? RATE_SCALE
      : (item.frozenRate ?? book.rateOn(item.currency, item.occurredOn));
  const toRate = book.rateOn(target, item.occurredOn);
  if (!fromRate || !toRate) return null;

  return convertMinor(
    item.amountMinor,
    item.currency,
    target,
    fromRate,
    toRate,
    precision,
  );
}
