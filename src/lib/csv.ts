/**
 * CSV pensado para abrirse en Excel con configuracion regional de Chile:
 * separador de columnas ";" (con "," Excel junta todo en una columna) y
 * decimal con coma. Cada exportacion lleva ademas el monto en unidades
 * minimas (entero exacto) para quien lo procese con otra herramienta.
 *
 * Las celdas de TEXTO que vienen del usuario (comercio, notas, nombres)
 * se neutralizan contra la inyeccion de formulas: si empiezan con = + - @
 * (o tabulador / retorno), Excel las ejecutaria al abrir el archivo, asi
 * que se les antepone un apostrofe.
 */

import { CURRENCY_CONFIG, type Currency } from "./money";

export const CSV_DELIMITER = ";";

const FORMULA_START = /^[=+\-@\t\r]/;

/** Celda de texto del usuario: neutraliza formulas y la entrecomilla si hace falta. */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return quote(safe);
}

/** Celda que ya es segura (numero, fecha, valor de un conjunto fijo): solo se entrecomilla si hace falta. */
export function csvRaw(value: string): string {
  return quote(value);
}

function quote(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Monto en unidades minimas como decimal con coma, sin separador de miles: -1050 USD-cents -> "-10,50". */
export function formatDecimalComma(amountMinor: bigint, currency: Currency): string {
  const { minorUnits } = CURRENCY_CONFIG[currency];
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(minorUnits);
  const integer = (abs / divisor).toString();
  const fraction =
    minorUnits > 0 ? `,${(abs % divisor).toString().padStart(minorUnits, "0")}` : "";
  return `${negative ? "-" : ""}${integer}${fraction}`;
}

/** Une filas ya procesadas con saltos de linea CRLF. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.join(CSV_DELIMITER)).join("\r\n") + "\r\n";
}
