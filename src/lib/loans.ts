/**
 * Prestamos formales (credito de consumo, hipotecario, automotriz):
 * tasa implicita y tabla de amortizacion. Logica pura.
 *
 * El usuario ingresa lo que dice su contrato: monto, numero de cuotas y
 * valor de la cuota (el banco no siempre informa la tasa, y el valor de
 * la cuota es el dato que si tiene a mano). De ahi se deduce la tasa
 * mensual que hace calzar esos tres numeros — sistema frances, cuota
 * fija — y con ella se arma el detalle de cada cuota: interes, capital y
 * saldo.
 *
 * La tasa se estima con coma flotante (no es un monto); los montos de la
 * tabla se calculan en enteros, redondeando el interes de cada periodo.
 * La ultima cuota se ajusta para dejar el saldo exactamente en cero.
 *
 * Una cuota con vencimiento anterior a hoy se considera pagada (no se
 * lleva registro de pagos): la cuota que vence hoy sigue pendiente.
 *
 * ABONOS EXTRAORDINARIOS (prepagos): un abono baja el capital desde la cuota
 * siguiente a su fecha (el interes de esa cuota se cobra completo: criterio
 * prudente). Con modo "acortar plazo" la cuota sigue igual y el prestamo
 * termina antes; con "bajar la cuota" el plazo se mantiene y la cuota baja.
 */

import { divRound } from "./fx";
import { monthKeyOf, shiftMonth } from "./dates";
import { dateInMonth } from "./cards";

/** Por encima de esto (100% mensual) la cuota ingresada no tiene sentido. */
const MAX_MONTHLY_RATE = 1;
const RATE_SCALE = 1_000_000_000_000n;

/** Cuota fija del sistema frances para una tasa mensual `rate` (0.015 = 1,5%). */
function annuityPayment(principal: number, rate: number, count: number): number {
  if (rate === 0) return principal / count;
  // 1 - (1+r)^-n, calculado de forma estable para tasas pequenas.
  const denominator = -Math.expm1(-count * Math.log1p(rate));
  return (principal * rate) / denominator;
}

/**
 * Tasa mensual implicita (0.015 = 1,5%) que hace que `count` cuotas de
 * `installment` amorticen `principal`. Devuelve 0 si las cuotas suman
 * exactamente el monto, y null si no tiene solucion (las cuotas no
 * alcanzan a cubrir el monto, o implican mas de 100% mensual).
 */
export function impliedMonthlyRate(
  principal: bigint,
  installment: bigint,
  count: number,
): number | null {
  if (principal <= 0n || installment <= 0n || count < 1) return null;
  const total = installment * BigInt(count);
  if (total < principal) return null;
  if (total === principal) return 0;

  const p = Number(principal);
  const c = Number(installment);
  if (annuityPayment(p, MAX_MONTHLY_RATE, count) <= c) return null;

  // La cuota crece con la tasa: biseccion.
  let low = 0;
  let high = MAX_MONTHLY_RATE;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (annuityPayment(p, mid, count) < c) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export type LoanTerms = {
  principalMinor: bigint;
  installmentMinor: bigint;
  count: number;
  firstDueDate: string;
};

export type PrepaymentMode = "shorten_term" | "reduce_installment";

/** Abono extraordinario al capital hecho en `paidOn`. */
export type Prepayment = {
  paidOn: string;
  amountMinor: bigint;
  mode: PrepaymentMode;
};

export type AmortizationRow = {
  number: number;
  dueDate: string;
  /** Lo que se paga ese mes (la ultima cuota puede diferir en unos pesos por redondeo). */
  installmentMinor: bigint;
  interestMinor: bigint;
  capitalMinor: bigint;
  /** Abono extraordinario aplicado justo despues de pagar esta cuota (0 si no hubo). */
  extraMinor: bigint;
  /** Capital que sigue debiendose despues de pagar esa cuota y el abono. */
  balanceMinor: bigint;
};

/** null si los datos del prestamo no tienen solucion (ver impliedMonthlyRate). */
export function amortizationSchedule(
  terms: LoanTerms,
  prepayments: Prepayment[] = [],
): { rate: number; rows: AmortizationRow[] } | null {
  const rate = impliedMonthlyRate(
    terms.principalMinor,
    terms.installmentMinor,
    terms.count,
  );
  if (rate === null) return null;

  const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)));
  const dueDay = Number(terms.firstDueDate.slice(8, 10));
  const firstMonth = monthKeyOf(terms.firstDueDate);
  const pending = [...prepayments]
    .filter((p) => p.amountMinor > 0n)
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));

  const rows: AmortizationRow[] = [];
  let balance = terms.principalMinor;
  let installment = terms.installmentMinor;
  let next = 0; // proximo abono por aplicar

  for (let k = 1; k <= terms.count && balance > 0n; k++) {
    const dueDate =
      k === 1 ? terms.firstDueDate : dateInMonth(shiftMonth(firstMonth, k - 1), dueDay);
    const interestMinor = divRound(balance * scaledRate, RATE_SCALE);
    let capitalMinor = installment - interestMinor;
    // La ultima cuota liquida lo que quede; ninguna puede amortizar mas que el saldo.
    if (k === terms.count || capitalMinor > balance) capitalMinor = balance;
    if (capitalMinor < 0n) capitalMinor = 0n;
    balance -= capitalMinor;

    // Los abonos hechos hasta esta cuota bajan el capital desde la siguiente.
    let extraMinor = 0n;
    let mode: PrepaymentMode = "shorten_term";
    while (next < pending.length && pending[next].paidOn <= dueDate) {
      const applied =
        pending[next].amountMinor < balance ? pending[next].amountMinor : balance;
      extraMinor += applied;
      balance -= applied;
      mode = pending[next].mode;
      next++;
    }
    if (extraMinor > 0n && mode === "reduce_installment" && balance > 0n) {
      const remaining = terms.count - k;
      if (remaining >= 1) {
        installment = BigInt(
          Math.round(annuityPayment(Number(balance), rate, remaining)),
        );
      }
    }

    rows.push({
      number: k,
      dueDate,
      installmentMinor: capitalMinor + interestMinor,
      interestMinor,
      capitalMinor,
      extraMinor,
      balanceMinor: balance,
    });
  }
  return { rate, rows };
}

export type LoanSummary = {
  /** Capital que se debe hoy (lo que cuenta como pasivo). */
  outstandingMinor: bigint;
  paidCount: number;
  remainingCount: number;
  next: AmortizationRow | null;
  /** Intereses de todo el prestamo. */
  totalInterestMinor: bigint;
};

/**
 * Capital que se debia en una fecha dada: lo que quedaba despues de la
 * ultima cuota con vencimiento anterior a esa fecha (o todo el capital si
 * ninguna habia vencido), menos los abonos hechos desde esa cuota hasta la
 * fecha (que se aplican a la tabla recien en la cuota siguiente). Mismo
 * criterio que `summarizeLoan`.
 */
export function outstandingAt(
  principalMinor: bigint,
  rows: AmortizationRow[],
  date: string,
  prepayments: Prepayment[] = [],
): bigint {
  let outstanding = principalMinor;
  let lastDue = "";
  for (const row of rows) {
    if (row.dueDate < date) {
      outstanding = row.balanceMinor;
      lastDue = row.dueDate;
    }
  }
  const unapplied = prepayments
    .filter((p) => p.paidOn > lastDue && p.paidOn <= date)
    .reduce((sum, p) => sum + p.amountMinor, 0n);
  const result = outstanding - unapplied;
  return result > 0n ? result : 0n;
}

export function summarizeLoan(
  principalMinor: bigint,
  rows: AmortizationRow[],
  today: string,
  prepayments: Prepayment[] = [],
): LoanSummary {
  const paid = rows.filter((row) => row.dueDate < today);
  const pending = rows.filter((row) => row.dueDate >= today);
  return {
    outstandingMinor: outstandingAt(principalMinor, rows, today, prepayments),
    paidCount: paid.length,
    remainingCount: pending.length,
    next: pending[0] ?? null,
    totalInterestMinor: rows.reduce((sum, row) => sum + row.interestMinor, 0n),
  };
}

/** Lo que ahorran los abonos frente a no haberlos hecho. */
export type PrepaymentSavings = {
  interestSavedMinor: bigint;
  /** Cuotas menos que hay que pagar. */
  installmentsSaved: number;
};

export function prepaymentSavings(
  terms: LoanTerms,
  prepayments: Prepayment[],
): PrepaymentSavings | null {
  if (prepayments.length === 0) return null;
  const base = amortizationSchedule(terms);
  const withExtras = amortizationSchedule(terms, prepayments);
  if (!base || !withExtras) return null;
  const interest = (rows: AmortizationRow[]) =>
    rows.reduce((sum, r) => sum + r.interestMinor, 0n);
  return {
    interestSavedMinor: interest(base.rows) - interest(withExtras.rows),
    installmentsSaved: base.rows.length - withExtras.rows.length,
  };
}
