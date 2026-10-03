/**
 * Instrumentos de inversion: tipos y etiquetas. Todo el calculo (valor,
 * ganancia, rentabilidad, TIR) vive en src/lib/holding-value.ts, que se
 * reexporta aqui para que el resto del codigo importe de un solo lugar.
 *
 * Un instrumento tiene dos tipos de registro:
 * - FLUJOS de capital: lo que pusiste (aporte, +) o sacaste (retiro, -), y en
 *   los instrumentos por unidades, cuantas unidades compraste o vendiste.
 * - VALORIZACIONES: cuanto vale en una fecha (a mano) o a que precio estaba
 *   cada unidad (crypto, fondos, acciones).
 *
 * Ganancia = valor + retirado - aportado. Rentabilidad = ganancia / aportado.
 * La tasa anual es la TIR (XIRR) de todos los flujos mas el valor de hoy; solo
 * se calcula con al menos 30 dias de historia, porque anualizar unas semanas
 * es ruido.
 */

import type { Flow, Valuation } from "./holding-value";

export * from "./holding-value";

export const HOLDING_KINDS = [
  "fixed_term_deposit",
  "mutual_fund",
  "stock",
  "crypto",
  "foreign_currency",
  "other",
] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

export const HOLDING_KIND_LABEL: Record<HoldingKind, string> = {
  fixed_term_deposit: "Depósito a plazo",
  mutual_fund: "Fondo mutuo",
  stock: "Acciones",
  crypto: "Cripto",
  foreign_currency: "Dólares / divisas",
  other: "Otro",
};

/** Reparto de la cartera por tipo de instrumento. */
export type AllocationRow = { kind: HoldingKind; valueMinor: bigint; percent: number };

/** Nombres historicos de los tipos de registro (aporte/retiro y valorizacion). */
export type HoldingFlow = Flow;
export type HoldingValuation = Valuation;
