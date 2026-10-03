/**
 * Lectura de la API publica de mindicador.cl (dolar observado, UF, UTM).
 * Solo parseo puro — la llamada de red y el guardado viven en
 * src/server/fx/sync.ts.
 *
 * Formato de la API (GET https://mindicador.cl/api/{codigo}[/{anio}]):
 *   { codigo: "dolar", serie: [{ fecha: "2026-09-24T03:00:00.000Z", valor: 959.39 }, ...] }
 * Las fechas vienen como medianoche de Chile expresada en UTC (T03:00Z
 * en horario de verano, T04:00Z en invierno), asi que se convierten a
 * fecha local de Santiago y no se cortan con un simple slice(0, 10).
 */

import { SANTIAGO_TZ } from "./dates";
import type { Currency } from "./money";
import { parseRate, type RateRow } from "./fx";

export const MINDICADOR_BASE_URL = "https://mindicador.cl/api";

/** Codigo de mindicador.cl para cada moneda con cotizacion (el CLP no tiene). */
export const MINDICADOR_CODES = {
  USD: "dolar",
  EUR: "euro",
  UF: "uf",
  UTM: "utm",
} as const satisfies Partial<Record<Currency, string>>;

export type QuotedCurrency = keyof typeof MINDICADOR_CODES;
export const QUOTED_CURRENCIES = Object.keys(MINDICADOR_CODES) as QuotedCurrency[];

const santiagoDate = new Intl.DateTimeFormat("en-CA", { timeZone: SANTIAGO_TZ });

export function toSantiagoDate(isoTimestamp: string): string | null {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  return santiagoDate.format(date);
}

/**
 * Convierte la respuesta de una serie en filas de cotizacion. Ignora en
 * silencio los puntos malformados (sin fecha o con valor no positivo)
 * en vez de fallar la sincronizacion completa por uno solo.
 */
export function parseMindicadorSeries(
  payload: unknown,
  currency: QuotedCurrency,
): RateRow[] {
  const serie = (payload as { serie?: unknown } | null)?.serie;
  if (!Array.isArray(serie)) return [];

  const rows: RateRow[] = [];
  const seen = new Set<string>();
  for (const point of serie as { fecha?: unknown; valor?: unknown }[]) {
    if (typeof point?.fecha !== "string" || typeof point?.valor !== "number") continue;
    const date = toSantiagoDate(point.fecha);
    const rate = parseRate(point.valor);
    if (!date || !rate || seen.has(date)) continue;
    seen.add(date);
    rows.push({ date, currency, rate });
  }
  return rows;
}
