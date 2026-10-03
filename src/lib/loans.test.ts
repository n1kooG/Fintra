import { describe, expect, it } from "vitest";
import {
  amortizationSchedule,
  impliedMonthlyRate,
  outstandingAt,
  prepaymentSavings,
  summarizeLoan,
  type LoanTerms,
  type Prepayment,
} from "./loans";

describe("impliedMonthlyRate", () => {
  it("sin interes cuando las cuotas suman exactamente el monto", () => {
    expect(impliedMonthlyRate(1200000n, 100000n, 12)).toBe(0);
  });

  it("recupera la tasa de una cuota calculada con 1,5% mensual", () => {
    // Cuota francesa de $5.000.000 a 24 meses y 1,5% mensual: ~$249.620.
    const rate = impliedMonthlyRate(5000000n, 249620n, 24)!;
    expect(rate).toBeGreaterThan(0.01499);
    expect(rate).toBeLessThan(0.01501);
  });

  it("sin solucion si las cuotas no cubren el monto", () => {
    expect(impliedMonthlyRate(1000000n, 90000n, 10)).toBeNull();
  });

  it("sin solucion si implica mas de 100% mensual, o datos invalidos", () => {
    expect(impliedMonthlyRate(1000000n, 2000000n, 5)).toBeNull();
    expect(impliedMonthlyRate(0n, 1000n, 5)).toBeNull();
    expect(impliedMonthlyRate(1000n, 100n, 0)).toBeNull();
  });
});

describe("amortizationSchedule", () => {
  it("sin interes: capital constante y saldo que baja parejo hasta cero", () => {
    const { rate, rows } = amortizationSchedule({
      principalMinor: 600000n,
      installmentMinor: 100000n,
      count: 6,
      firstDueDate: "2026-10-10",
    })!;
    expect(rate).toBe(0);
    expect(rows.map((r) => r.balanceMinor)).toEqual([
      500000n,
      400000n,
      300000n,
      200000n,
      100000n,
      0n,
    ]);
    expect(rows.every((r) => r.interestMinor === 0n)).toBe(true);
    expect(rows.map((r) => r.dueDate).slice(0, 3)).toEqual([
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
    ]);
  });

  const withInterest = amortizationSchedule({
    principalMinor: 5000000n,
    installmentMinor: 249620n,
    count: 24,
    firstDueDate: "2026-10-10",
  })!;

  it("con interes: el interes baja y el capital sube, y el saldo termina exactamente en cero", () => {
    const { rows } = withInterest;
    expect(rows).toHaveLength(24);
    // Primer mes: 1,5% de 5.000.000 = 75.000 de interes.
    expect(rows[0].interestMinor).toBeGreaterThan(74900n);
    expect(rows[0].interestMinor).toBeLessThan(75100n);
    expect(rows[0].capitalMinor).toBe(rows[0].installmentMinor - rows[0].interestMinor);
    expect(rows[1].interestMinor).toBeLessThan(rows[0].interestMinor);
    expect(rows[1].capitalMinor).toBeGreaterThan(rows[0].capitalMinor);
    expect(rows[23].balanceMinor).toBe(0n);
  });

  it("el capital amortizado suma exactamente el monto prestado", () => {
    const totalCapital = withInterest.rows.reduce((sum, r) => sum + r.capitalMinor, 0n);
    expect(totalCapital).toBe(5000000n);
  });

  it("la ultima cuota se ajusta apenas (unos pesos) por redondeo", () => {
    const last = withInterest.rows[23].installmentMinor;
    expect(last > 249000n && last < 250200n).toBe(true);
  });

  it("sin solucion devuelve null", () => {
    expect(
      amortizationSchedule({
        principalMinor: 1000000n,
        installmentMinor: 90000n,
        count: 10,
        firstDueDate: "2026-10-10",
      }),
    ).toBeNull();
  });
});

describe("summarizeLoan", () => {
  const { rows } = amortizationSchedule({
    principalMinor: 600000n,
    installmentMinor: 100000n,
    count: 6,
    firstDueDate: "2026-10-10",
  })!;

  it("antes de la primera cuota se debe todo el capital", () => {
    const s = summarizeLoan(600000n, rows, "2026-10-01");
    expect(s.outstandingMinor).toBe(600000n);
    expect(s.paidCount).toBe(0);
    expect(s.remainingCount).toBe(6);
    expect(s.next?.number).toBe(1);
  });

  it("la cuota que vence hoy sigue pendiente; las anteriores se dan por pagadas", () => {
    expect(summarizeLoan(600000n, rows, "2026-10-10").paidCount).toBe(0);
    const s = summarizeLoan(600000n, rows, "2026-12-11");
    expect(s.paidCount).toBe(3);
    expect(s.outstandingMinor).toBe(300000n);
    expect(s.next?.dueDate).toBe("2027-01-10");
  });

  it("terminado: no se debe nada y no hay proxima cuota", () => {
    const s = summarizeLoan(600000n, rows, "2027-06-01");
    expect(s.outstandingMinor).toBe(0n);
    expect(s.next).toBeNull();
    expect(s.remainingCount).toBe(0);
  });

  it("suma los intereses totales", () => {
    expect(summarizeLoan(600000n, rows, "2026-10-01").totalInterestMinor).toBe(0n);
  });
});

describe("abonos extraordinarios", () => {
  // $5.000.000 a 24 cuotas de $249.620 (~1,5 % mensual), primera cuota el 10-oct-2026.
  const terms: LoanTerms = {
    principalMinor: 5_000_000n,
    installmentMinor: 249_620n,
    count: 24,
    firstDueDate: "2026-10-10",
  };
  const shorten: Prepayment = {
    paidOn: "2026-12-01",
    amountMinor: 1_000_000n,
    mode: "shorten_term",
  };
  const reduce: Prepayment = {
    paidOn: "2026-12-01",
    amountMinor: 1_000_000n,
    mode: "reduce_installment",
  };

  it("sin abonos el resultado es el de siempre y cada fila trae extra cero", () => {
    const { rows } = amortizationSchedule(terms)!;
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.extraMinor === 0n)).toBe(true);
    expect(rows[23].balanceMinor).toBe(0n);
  });

  it("acortar plazo: la cuota sigue igual y el prestamo termina antes", () => {
    const base = amortizationSchedule(terms)!;
    const withExtra = amortizationSchedule(terms, [shorten])!;
    expect(withExtra.rows.length).toBeLessThan(24);
    expect(withExtra.rows[0].installmentMinor).toBe(base.rows[0].installmentMinor);
    expect(withExtra.rows.at(-1)!.balanceMinor).toBe(0n);
    // El abono se aplica despues de la cuota de diciembre (la de 10-dic).
    const december = withExtra.rows.find((r) => r.dueDate === "2026-12-10")!;
    expect(december.extraMinor).toBe(1_000_000n);
    expect(december.balanceMinor).toBe(
      base.rows.find((r) => r.dueDate === "2026-12-10")!.balanceMinor - 1_000_000n,
    );
  });

  it("bajar la cuota: el plazo se mantiene y la cuota siguiente es menor", () => {
    const base = amortizationSchedule(terms)!;
    const withExtra = amortizationSchedule(terms, [reduce])!;
    expect(withExtra.rows).toHaveLength(24);
    const idx = withExtra.rows.findIndex((r) => r.dueDate === "2026-12-10");
    expect(withExtra.rows[idx + 1].installmentMinor).toBeLessThan(
      base.rows[idx + 1].installmentMinor,
    );
    expect(withExtra.rows.at(-1)!.balanceMinor).toBe(0n);
  });

  it("ahorra intereses y, al acortar, cuotas", () => {
    const shortened = prepaymentSavings(terms, [shorten])!;
    expect(shortened.interestSavedMinor).toBeGreaterThan(0n);
    expect(shortened.installmentsSaved).toBeGreaterThan(0);
    const reduced = prepaymentSavings(terms, [reduce])!;
    expect(reduced.interestSavedMinor).toBeGreaterThan(0n);
    expect(reduced.installmentsSaved).toBe(0);
    expect(prepaymentSavings(terms, [])).toBeNull();
  });

  it("un abono mayor que el saldo solo liquida lo que se debe", () => {
    const huge: Prepayment = {
      paidOn: "2026-11-01",
      amountMinor: 99_000_000n,
      mode: "shorten_term",
    };
    const { rows } = amortizationSchedule(terms, [huge])!;
    expect(rows.at(-1)!.balanceMinor).toBe(0n);
    expect(rows.length).toBeLessThan(6);
    expect(rows.reduce((s, r) => s + r.capitalMinor + r.extraMinor, 0n)).toBe(5_000_000n);
  });

  it("un abono posterior al fin del prestamo no cambia nada", () => {
    const late: Prepayment = {
      paidOn: "2030-01-01",
      amountMinor: 1n,
      mode: "shorten_term",
    };
    expect(amortizationSchedule(terms, [late])!.rows).toEqual(
      amortizationSchedule(terms)!.rows,
    );
  });

  it("varios abonos se acumulan en orden de fecha", () => {
    const a: Prepayment = {
      paidOn: "2027-02-01",
      amountMinor: 300_000n,
      mode: "shorten_term",
    };
    const b: Prepayment = {
      paidOn: "2026-11-01",
      amountMinor: 200_000n,
      mode: "shorten_term",
    };
    const { rows } = amortizationSchedule(terms, [a, b])!;
    expect(rows.reduce((s, r) => s + r.extraMinor, 0n)).toBe(500_000n);
    expect(rows.find((r) => r.dueDate === "2026-11-10")!.extraMinor).toBe(200_000n);
  });

  it("el capital pendiente baja apenas se hace el abono, sin esperar a la cuota siguiente", () => {
    const { rows } = amortizationSchedule(terms, [shorten])!;
    const before = outstandingAt(terms.principalMinor, rows, "2026-12-01", []);
    const after = outstandingAt(terms.principalMinor, rows, "2026-12-02", [shorten]);
    expect(before - after).toBe(1_000_000n);
    // Y despues de que la cuota lo aplica, no se descuenta dos veces.
    const later = outstandingAt(terms.principalMinor, rows, "2026-12-11", [shorten]);
    expect(later).toBe(rows.find((r) => r.dueDate === "2026-12-10")!.balanceMinor);
  });

  it("el resumen usa el capital con abonos", () => {
    const { rows } = amortizationSchedule(terms, [shorten])!;
    const summary = summarizeLoan(terms.principalMinor, rows, "2026-12-02", [shorten]);
    const noPre = summarizeLoan(
      terms.principalMinor,
      amortizationSchedule(terms)!.rows,
      "2026-12-02",
    );
    expect(noPre.outstandingMinor - summary.outstandingMinor).toBe(1_000_000n);
  });
});
