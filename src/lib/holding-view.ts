/**
 * Arma lo que muestra la pantalla de Inversiones para cada instrumento, a
 * partir de la fila tal como llega de la base. Logica pura (sin red ni base):
 * recibe el libro de cotizaciones ya cargado.
 */

import { daysBetween } from "./dates";
import { RateBook } from "./fx";
import {
  annualizePercent,
  changePercent,
  fixedTermInterestMinor,
  holdingMetrics,
  isUnitMethod,
  parseScaled,
  parseUnits,
  parsePrice,
  periodReturnPercent,
  priceLookupFor,
  realReturnPercent,
  VALUATION_METHODS,
  type FixedTermTerms,
  type Flow,
  type HoldingMetrics,
  type HoldingSpec,
  type RatePeriod,
  type Valuation,
  type ValuationMethod,
} from "./holding-value";
import type { HoldingKind } from "./investments";
import type { Currency } from "./money";
import { addDays } from "./recurrence";

/** La fila de `holdings` con sus aportes y valorizaciones embebidos (PostgREST). */
export type HoldingRow = {
  id: string;
  name: string;
  kind: HoldingKind;
  currency: Currency;
  institution: string | null;
  notes: string | null;
  archived: boolean;
  valuation_method: string;
  asset_code: string | null;
  term_start: string | null;
  term_end: string | null;
  rate_percent: string | number | null;
  rate_period: string | null;
  flows: {
    id: string;
    occurred_on: string;
    amount_minor: string;
    units: string | number | null;
    notes: string | null;
  }[];
  valuations: {
    id: string;
    valued_on: string;
    value_minor: string;
    unit_price: string | number | null;
    source: string | null;
  }[];
};

export type FlowView = {
  id: string;
  occurredOn: string;
  /** Aporte (+) o retiro (-). */
  amountMinor: bigint;
  /** Unidades compradas (+) o vendidas (-), si el instrumento cuenta unidades. */
  units: bigint | null;
  notes: string | null;
};

export type ValuationView = {
  id: string;
  valuedOn: string;
  valueMinor: bigint;
  unitPrice: bigint | null;
  source: string;
};

export type Maturity = {
  end: string;
  /** Dias que faltan (negativo si ya vencio). */
  days: number;
  /** Interes devengado hoy. */
  accruedMinor: bigint;
  /** Capital + interes al vencimiento. */
  totalAtMaturityMinor: bigint;
};

export type HoldingView = {
  id: string;
  name: string;
  kind: HoldingKind;
  currency: Currency;
  institution: string | null;
  notes: string | null;
  archived: boolean;
  method: ValuationMethod;
  assetCode: string | null;
  terms: FixedTermTerms | null;
  /** Del mas reciente al mas antiguo. */
  flows: FlowView[];
  valuations: ValuationView[];
  metrics: HoldingMetrics;
  /** Rentabilidad de los ultimos 30 dias, en %; null sin base suficiente. */
  monthReturnPercent: number | null;
  /** TIR anual descontada la inflacion (UF), en %; null sin historia o sin UF. */
  realAnnualPercent: number | null;
  maturity: Maturity | null;
};

const byDateDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export function methodOf(row: Pick<HoldingRow, "valuation_method">): ValuationMethod {
  return (VALUATION_METHODS as readonly string[]).includes(row.valuation_method)
    ? (row.valuation_method as ValuationMethod)
    : "manual";
}

export function termsFromRow(row: HoldingRow): FixedTermTerms | null {
  if (!row.term_start || !row.term_end || row.rate_percent == null || !row.rate_period) {
    return null;
  }
  const rate = parseScaled(row.rate_percent, 4);
  if (rate === null) return null;
  return {
    start: row.term_start,
    end: row.term_end,
    ratePercentScaled: rate,
    period: row.rate_period as RatePeriod,
  };
}

export function specFromRow(row: HoldingRow): HoldingSpec {
  return { method: methodOf(row), currency: row.currency, terms: termsFromRow(row) };
}

export function flowsFromRow(row: HoldingRow): FlowView[] {
  return row.flows
    .map((f) => ({
      id: f.id,
      occurredOn: f.occurred_on,
      amountMinor: BigInt(f.amount_minor),
      units: f.units == null ? null : parseUnits(f.units),
      notes: f.notes,
    }))
    .sort((a, b) => byDateDesc(a.occurredOn, b.occurredOn));
}

export function valuationsFromRow(row: HoldingRow): ValuationView[] {
  return row.valuations
    .map((v) => ({
      id: v.id,
      valuedOn: v.valued_on,
      valueMinor: BigInt(v.value_minor),
      unitPrice: v.unit_price == null ? null : parsePrice(v.unit_price),
      source: v.source ?? "manual",
    }))
    .sort((a, b) => byDateDesc(a.valuedOn, b.valuedOn));
}

/** Cotizacion de una moneda como "precio por unidad" (CLP por unidad, escalado), para `fx`. */
export function rateAtFromBook(book: RateBook) {
  return (code: string, date: string) => {
    const found = book.latest(code as Currency, date);
    return found ? { price: found.rate, date: found.date } : null;
  };
}

export function buildHoldingView(
  row: HoldingRow,
  today: string,
  book: RateBook,
): HoldingView {
  const spec = specFromRow(row);
  const flows = flowsFromRow(row);
  const valuations = valuationsFromRow(row);
  const flowList: Flow[] = flows;
  const valuationList: Valuation[] = valuations;
  const priceAt = priceLookupFor(
    spec.method,
    row.asset_code,
    valuationList,
    rateAtFromBook(book),
  );

  const metrics = holdingMetrics(spec, flowList, valuationList, priceAt, today);

  // Solo si el instrumento ya existia hace 30 dias: uno nuevo no tiene mes que comparar.
  const firstFlow = flows.length > 0 ? flows[flows.length - 1].occurredOn : null;
  const monthStart = addDays(today, -30);
  const monthReturnPercent =
    firstFlow && firstFlow <= monthStart
      ? periodReturnPercent(spec, flowList, valuationList, priceAt, monthStart, today)
      : null;

  // Rentabilidad real = TIR anual descontada la inflacion del mismo periodo,
  // medida con la UF (que se reajusta por IPC).
  let realAnnualPercent: number | null = null;
  if (metrics.annualizedPercent !== null && firstFlow) {
    const ufStart = book.rateOn("UF", firstFlow);
    const ufEnd = book.rateOn("UF", today);
    const change = ufStart && ufEnd ? changePercent(ufStart, ufEnd) : null;
    const inflationAnnual =
      change === null ? null : annualizePercent(change, daysBetween(firstFlow, today));
    if (inflationAnnual !== null) {
      realAnnualPercent = realReturnPercent(metrics.annualizedPercent, inflationAnnual);
    }
  }

  let maturity: Maturity | null = null;
  if (spec.method === "fixed_term" && spec.terms) {
    const principal = metrics.investedMinor;
    maturity = {
      end: spec.terms.end,
      days: daysBetween(today, spec.terms.end),
      accruedMinor: fixedTermInterestMinor(principal, spec.terms, today),
      totalAtMaturityMinor:
        principal + fixedTermInterestMinor(principal, spec.terms, spec.terms.end),
    };
  }

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    institution: row.institution,
    notes: row.notes,
    archived: row.archived,
    method: spec.method,
    assetCode: isUnitMethod(spec.method) ? row.asset_code : null,
    terms: spec.terms ?? null,
    flows,
    valuations,
    metrics,
    monthReturnPercent,
    realAnnualPercent,
    maturity,
  };
}
