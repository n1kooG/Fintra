/**
 * Valor de un instrumento de inversion segun COMO se valoriza (logica pura).
 *
 *  manual      el valor lo escribes tu (valorizaciones); ver `manualValueAt`
 *  fx          unidades de una moneda con cotizacion (USD, EUR, UF, UTM): valen
 *              unidades x cotizacion del dia, automatico
 *  crypto      unidades de una criptomoneda x precio de mercado del dia
 *  priced      unidades x un precio por unidad que escribes tu (cuotas de un
 *              fondo mutuo, acciones)
 *  fixed_term  deposito a plazo: capital + interes devengado hasta hoy
 *
 * Todo es aritmetica entera (BigInt): unidades con 8 decimales, precios con 6
 * (igual que las cotizaciones de src/lib/fx.ts), y un solo redondeo al final.
 *
 * El capital de cada aporte/retiro (`amountMinor`) es SIEMPRE lo que costo, en
 * la moneda del instrumento; las unidades son aparte. Asi la ganancia incluye
 * el efecto del precio (o del tipo de cambio) sin ambiguedad.
 */

import { daysBetween } from "./dates";
import { divRound } from "./fx";
import { CURRENCY_CONFIG, type Currency } from "./money";

export const UNITS_SCALE = 100_000_000n; // 8 decimales
export const PRICE_SCALE = 1_000_000n; // 6 decimales
const UNITS_DECIMALS = 8;
const PRICE_DECIMALS = 6;

export const VALUATION_METHODS = [
  "manual",
  "fx",
  "crypto",
  "priced",
  "fixed_term",
] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

/** Metodos que cuentan unidades (y por eso piden cuantas unidades en cada aporte). */
export const UNIT_METHODS: readonly ValuationMethod[] = ["fx", "crypto", "priced"];
export function isUnitMethod(method: ValuationMethod): boolean {
  return UNIT_METHODS.includes(method);
}

export type RatePeriod = "monthly" | "annual";

/** Condiciones de un deposito a plazo. `ratePercentScaled` = % x 10.000 (0,45 % -> 4500). */
export type FixedTermTerms = {
  start: string;
  end: string;
  ratePercentScaled: bigint;
  period: RatePeriod;
};

export type HoldingSpec = {
  method: ValuationMethod;
  currency: Currency;
  terms?: FixedTermTerms | null;
};

export type Flow = {
  occurredOn: string;
  /** Capital: aporte (+) o retiro (-), en la moneda del instrumento. */
  amountMinor: bigint;
  /** Unidades compradas (+) o vendidas (-), escaladas por UNITS_SCALE; solo en metodos de unidades. */
  units?: bigint | null;
};

export type Valuation = {
  valuedOn: string;
  valueMinor: bigint;
  /** Precio por unidad escalado por PRICE_SCALE, si la fila es un punto de precio. */
  unitPrice?: bigint | null;
};

/** Precio por unidad (en la moneda del instrumento, escalado) vigente en una fecha, y de cuando es. */
export type PriceLookup = (date: string) => { price: bigint; date: string } | null;

export type HoldingValue = {
  valueMinor: bigint;
  /** true si el valor sale de una valorizacion, un precio o un calculo; false = a costo. */
  valued: boolean;
  /** Fecha de la valorizacion o del precio usado (null si no aplica). */
  valuedOn: string | null;
};

// ---------------------------------------------------------------------------
// Decimales <-> enteros escalados
// ---------------------------------------------------------------------------

/** "0.002", "-1.5", 12 -> entero escalado por 10^decimals; null si no es un decimal valido. */
export function parseScaled(
  value: string | number | null | undefined,
  decimals: number,
): bigint | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "number" ? value.toFixed(decimals) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) return null;
  const [, sign, intPart, fracPart = ""] = match;
  const frac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const scaled = BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return sign === "-" ? -scaled : scaled;
}

export const parseUnits = (v: string | number | null | undefined) =>
  parseScaled(v, UNITS_DECIMALS);
export const parsePrice = (v: string | number | null | undefined) =>
  parseScaled(v, PRICE_DECIMALS);

/** Entero escalado -> decimal exacto para guardar en numeric ("0.00200000"). */
export function formatScaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const frac = (abs % base).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${abs / base}.${frac}`;
}

export const unitsToDb = (units: bigint) => formatScaled(units, UNITS_DECIMALS);
export const priceToDb = (price: bigint) => formatScaled(price, PRICE_DECIMALS);

/** Para mostrar: "1.500", "0,002", sin ceros de relleno ("1.500,25"). */
export function formatUnits(units: bigint, maxDecimals = UNITS_DECIMALS): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const integer = (abs / UNITS_SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = (abs % UNITS_SCALE)
    .toString()
    .padStart(UNITS_DECIMALS, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${frac ? `,${frac}` : ""}`;
}

// ---------------------------------------------------------------------------
// Unidades x precio
// ---------------------------------------------------------------------------

/** Valor en unidades minimas de `units` a `price` (por unidad), redondeado una sola vez. */
export function unitsValueMinor(
  units: bigint,
  price: bigint,
  currency: Currency,
): bigint {
  const minor = 10n ** BigInt(CURRENCY_CONFIG[currency].minorUnits);
  return divRound(units * price * minor, UNITS_SCALE * PRICE_SCALE);
}

export function unitsHeldAt(flows: Flow[], date: string): bigint {
  return flows
    .filter((f) => f.occurredOn <= date)
    .reduce((sum, f) => sum + (f.units ?? 0n), 0n);
}

/** Precio por unidad vigente = el ultimo punto de precio en o antes de la fecha. */
export function priceLookupFromValuations(valuations: Valuation[]): PriceLookup {
  const points = valuations
    .filter((v) => v.unitPrice !== null && v.unitPrice !== undefined && v.unitPrice > 0n)
    .sort((a, b) => (a.valuedOn < b.valuedOn ? -1 : a.valuedOn > b.valuedOn ? 1 : 0));
  return (date) => {
    let found: Valuation | null = null;
    for (const p of points) {
      if (p.valuedOn <= date) found = p;
      else break;
    }
    return found ? { price: found.unitPrice!, date: found.valuedOn } : null;
  };
}

/**
 * Buscador de precio por unidad segun el metodo: `fx` usa la cotizacion de la
 * moneda (`rateAt` la entrega ya escalada por PRICE_SCALE); `crypto` y `priced`
 * usan los puntos de precio guardados. Null para el resto de los metodos.
 */
export function priceLookupFor(
  method: ValuationMethod,
  assetCode: string | null,
  valuations: Valuation[],
  rateAt: (assetCode: string, date: string) => { price: bigint; date: string } | null,
): PriceLookup | null {
  if (method === "fx") {
    return assetCode ? (date) => rateAt(assetCode, date) : null;
  }
  if (method === "crypto" || method === "priced")
    return priceLookupFromValuations(valuations);
  return null;
}

// ---------------------------------------------------------------------------
// Deposito a plazo
// ---------------------------------------------------------------------------

/**
 * Interes simple devengado entre `start` y `min(date, end)`. Tasa mensual: el
 * interes de 30 dias es capital x tasa (asi la publican los bancos chilenos);
 * tasa anual: base 365. Cero antes de la fecha de inicio.
 */
export function fixedTermInterestMinor(
  principalMinor: bigint,
  terms: FixedTermTerms,
  date: string,
): bigint {
  const until = date < terms.end ? date : terms.end;
  const days = Math.max(0, daysBetween(terms.start, until));
  if (days === 0 || principalMinor <= 0n) return 0n;
  const basis = terms.period === "monthly" ? 30n : 365n;
  // % x 10.000 / 100 = fraccion x 1.000.000
  return divRound(
    principalMinor * terms.ratePercentScaled * BigInt(days),
    1_000_000n * basis,
  );
}

export function daysToMaturity(terms: FixedTermTerms, today: string): number {
  return daysBetween(today, terms.end);
}

// ---------------------------------------------------------------------------
// Valor en una fecha
// ---------------------------------------------------------------------------

function netFlowsAt(flows: Flow[], date: string): bigint {
  return flows
    .filter((f) => f.occurredOn <= date)
    .reduce((s, f) => s + f.amountMinor, 0n);
}

const nonNegative = (v: bigint) => (v > 0n ? v : 0n);

/**
 * Metodo manual: la ultima valorizacion hasta la fecha MAS los flujos
 * posteriores a ella. Sin valorizacion, el valor es lo aportado neto (a costo).
 * Un flujo del mismo dia de una valorizacion se da por incluido en ella.
 */
export function manualValueAt(
  flows: Flow[],
  valuations: Valuation[],
  date: string,
): HoldingValue {
  let latest: Valuation | null = null;
  for (const valuation of valuations) {
    if (valuation.valuedOn <= date && (!latest || valuation.valuedOn > latest.valuedOn)) {
      latest = valuation;
    }
  }
  if (latest) {
    const after = flows
      .filter((f) => f.occurredOn > latest.valuedOn && f.occurredOn <= date)
      .reduce((sum, f) => sum + f.amountMinor, 0n);
    return {
      valueMinor: nonNegative(latest.valueMinor + after),
      valued: true,
      valuedOn: latest.valuedOn,
    };
  }
  return {
    valueMinor: nonNegative(netFlowsAt(flows, date)),
    valued: false,
    valuedOn: null,
  };
}

export function holdingValueAt(
  spec: HoldingSpec,
  flows: Flow[],
  valuations: Valuation[],
  priceAt: PriceLookup | null,
  date: string,
): HoldingValue {
  const cost = (): HoldingValue => ({
    valueMinor: nonNegative(netFlowsAt(flows, date)),
    valued: false,
    valuedOn: null,
  });

  if (spec.method === "manual") return manualValueAt(flows, valuations, date);

  if (spec.method === "fixed_term") {
    if (!spec.terms) return cost();
    const counted = flows.filter((f) => f.occurredOn <= date);
    const invested = counted.reduce(
      (s, f) => (f.amountMinor > 0n ? s + f.amountMinor : s),
      0n,
    );
    const withdrawn = counted.reduce(
      (s, f) => (f.amountMinor < 0n ? s - f.amountMinor : s),
      0n,
    );
    if (invested === 0n || withdrawn >= invested) return cost();
    const interest = fixedTermInterestMinor(invested, spec.terms, date);
    return {
      valueMinor: nonNegative(invested - withdrawn + interest),
      valued: true,
      valuedOn: date < spec.terms.end ? date : spec.terms.end,
    };
  }

  // Metodos de unidades: unidades x precio vigente.
  const recorded = flows.some((f) => f.occurredOn <= date && f.units != null);
  if (!recorded) return cost();
  const units = unitsHeldAt(flows, date);
  if (units <= 0n) return { valueMinor: 0n, valued: true, valuedOn: null };
  const point = priceAt ? priceAt(date) : null;
  if (!point) return cost();
  return {
    valueMinor: unitsValueMinor(units, point.price, spec.currency),
    valued: true,
    valuedOn: point.date,
  };
}

// ---------------------------------------------------------------------------
// Metricas
// ---------------------------------------------------------------------------

/** Porcentaje de `part` sobre `base` con 2 decimales (hacia cero); null si la base es cero. */
export function percentOf(part: bigint, base: bigint): number | null {
  if (base <= 0n) return null;
  return Number((part * 10_000n) / base) / 100;
}

export type CashFlow = { date: string; amount: number };

/**
 * Tasa interna de retorno anual (XIRR) de flujos de caja fechados: lo que
 * pones es negativo, lo que recibes (y el valor final) positivo. null si no
 * hay solucion util: sin flujos de los dos signos, menos de `minDays` de
 * historia, o sin cambio de signo en el rango buscado.
 */
export function xirr(flows: CashFlow[], minDays = 30): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const first = sorted[0].date;
  const spanDays = daysBetween(first, sorted[sorted.length - 1].date);
  if (spanDays < minDays) return null;
  if (!sorted.some((f) => f.amount < 0) || !sorted.some((f) => f.amount > 0)) return null;

  const years = sorted.map((f) => daysBetween(first, f.date) / 365);
  const npv = (rate: number) =>
    sorted.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0);

  let low = -0.9999;
  let high = 100;
  const npvLow = npv(low);
  const npvHigh = npv(high);
  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh) || npvLow * npvHigh > 0)
    return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (value > 0 === npvLow > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export type HoldingMetrics = HoldingValue & {
  investedMinor: bigint;
  withdrawnMinor: bigint;
  gainMinor: bigint;
  /** Ganancia sobre lo aportado, en %; null si no se aporto nada. */
  returnPercent: number | null;
  /** TIR anual en %; null si la historia es corta o no tiene solucion. */
  annualizedPercent: number | null;
  /** Unidades que se tienen hoy (solo metodos de unidades), escaladas. */
  unitsHeld: bigint | null;
  /** Precio por unidad vigente (escalado) y de cuando es. */
  unitPrice: bigint | null;
};

export function holdingMetrics(
  spec: HoldingSpec,
  flows: Flow[],
  valuations: Valuation[],
  priceAt: PriceLookup | null,
  today: string,
): HoldingMetrics {
  const counted = flows.filter((f) => f.occurredOn <= today);
  const value = holdingValueAt(spec, counted, valuations, priceAt, today);

  const investedMinor = counted.reduce(
    (s, f) => (f.amountMinor > 0n ? s + f.amountMinor : s),
    0n,
  );
  const withdrawnMinor = counted.reduce(
    (s, f) => (f.amountMinor < 0n ? s - f.amountMinor : s),
    0n,
  );
  const gainMinor = value.valueMinor + withdrawnMinor - investedMinor;

  const cashFlows: CashFlow[] = counted.map((f) => ({
    date: f.occurredOn,
    amount: -Number(f.amountMinor),
  }));
  cashFlows.push({ date: today, amount: Number(value.valueMinor) });
  const annual = xirr(cashFlows);

  const unitMode = isUnitMethod(spec.method);
  const point = unitMode && priceAt ? priceAt(today) : null;
  return {
    ...value,
    investedMinor,
    withdrawnMinor,
    gainMinor,
    returnPercent: percentOf(gainMinor, investedMinor),
    annualizedPercent: annual === null ? null : Math.round(annual * 10_000) / 100,
    unitsHeld: unitMode ? unitsHeldAt(counted, today) : null,
    unitPrice: point?.price ?? null,
  };
}

/**
 * Rentabilidad de un periodo [start, end] por el metodo de Dietz modificado:
 * (V1 - V0 - F) / (V0 + suma(peso x flujo)), donde el peso de un flujo es la
 * fraccion del periodo que estuvo invertido. Aisla la ganancia de los aportes
 * y retiros hechos en el periodo. null si el periodo no tiene base de capital.
 */
export function periodReturnPercent(
  spec: HoldingSpec,
  flows: Flow[],
  valuations: Valuation[],
  priceAt: PriceLookup | null,
  start: string,
  end: string,
): number | null {
  const totalDays = daysBetween(start, end);
  if (totalDays <= 0) return null;

  const v0 = Number(holdingValueAt(spec, flows, valuations, priceAt, start).valueMinor);
  const v1 = Number(holdingValueAt(spec, flows, valuations, priceAt, end).valueMinor);
  const inPeriod = flows.filter((f) => f.occurredOn > start && f.occurredOn <= end);
  const netFlow = inPeriod.reduce((s, f) => s + Number(f.amountMinor), 0);
  const weighted = inPeriod.reduce(
    (s, f) =>
      s +
      Number(f.amountMinor) *
        ((totalDays - daysBetween(start, f.occurredOn)) / totalDays),
    0,
  );

  const base = v0 + weighted;
  if (base <= 0) return null;
  return Math.round(((v1 - v0 - netFlow) / base) * 10_000) / 100;
}

/**
 * Rentabilidad real: descuenta la inflacion. `inflationPercent` es el alza de
 * la UF en el mismo periodo (la UF se reajusta con el IPC), de modo que
 * "real" significa "por encima de la UF".
 */
export function realReturnPercent(
  nominalPercent: number,
  inflationPercent: number,
): number {
  const real = ((1 + nominalPercent / 100) / (1 + inflationPercent / 100) - 1) * 100;
  return Math.round(real * 100) / 100;
}

/** Variacion porcentual entre dos cotizaciones escaladas (UF inicial y final). */
export function changePercent(from: bigint, to: bigint): number | null {
  if (from <= 0n) return null;
  return Math.round(Number(((to - from) * 1_000_000n) / from) / 100) / 100;
}

/** Anualiza una variacion de `percent` ocurrida en `days` dias: (1+p)^(365/d) - 1. */
export function annualizePercent(percent: number, days: number): number | null {
  if (days < 30) return null;
  const annual = (Math.pow(1 + percent / 100, 365 / days) - 1) * 100;
  return Number.isFinite(annual) ? Math.round(annual * 100) / 100 : null;
}

/** Reparto del valor por tipo de instrumento, de mayor a menor, con % de 1 decimal. */
export function allocationByKind<K extends string>(
  items: { kind: K; valueMinor: bigint }[],
): { kind: K; valueMinor: bigint; percent: number }[] {
  const totals = new Map<K, bigint>();
  for (const item of items) {
    if (item.valueMinor <= 0n) continue;
    totals.set(item.kind, (totals.get(item.kind) ?? 0n) + item.valueMinor);
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0n);
  if (total === 0n) return [];

  return [...totals.entries()]
    .map(([kind, valueMinor]) => ({
      kind,
      valueMinor,
      percent: Number((valueMinor * 1000n) / total) / 10,
    }))
    .sort((a, b) =>
      b.valueMinor > a.valueMinor ? 1 : b.valueMinor < a.valueMinor ? -1 : 0,
    );
}
