import { describe, expect, it } from "vitest";
import { RateBook, parseRate } from "./fx";
import { buildHoldingView, termsFromRow, type HoldingRow } from "./holding-view";

const rate = (n: number) => parseRate(n)!;

function row(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: "h1",
    name: "Instrumento",
    kind: "other",
    currency: "CLP",
    institution: null,
    notes: null,
    archived: false,
    valuation_method: "manual",
    asset_code: null,
    term_start: null,
    term_end: null,
    rate_percent: null,
    rate_period: null,
    flows: [],
    valuations: [],
    ...overrides,
  };
}

const TODAY = "2026-10-01";

describe("instrumento manual", () => {
  it("se arma igual que antes: valor de la ultima valorizacion", () => {
    const view = buildHoldingView(
      row({
        flows: [
          {
            id: "f1",
            occurred_on: "2026-01-10",
            amount_minor: "1000000",
            units: null,
            notes: null,
          },
        ],
        valuations: [
          {
            id: "v1",
            valued_on: "2026-09-30",
            value_minor: "1100000",
            unit_price: null,
            source: "manual",
          },
        ],
      }),
      TODAY,
      new RateBook([]),
    );
    expect(view.method).toBe("manual");
    expect(view.metrics.valueMinor).toBe(1_100_000n);
    expect(view.metrics.gainMinor).toBe(100_000n);
    expect(view.maturity).toBeNull();
    expect(view.assetCode).toBeNull();
  });

  it("un metodo desconocido en la base se trata como manual", () => {
    const view = buildHoldingView(
      row({ valuation_method: "magia" }),
      TODAY,
      new RateBook([]),
    );
    expect(view.method).toBe("manual");
  });
});

describe("dolares con valorizacion automatica", () => {
  const book = new RateBook([
    { date: "2026-01-10", currency: "USD", rate: rate(933.33) },
    { date: "2026-09-30", currency: "USD", rate: rate(960) },
    { date: "2026-01-10", currency: "UF", rate: rate(40_000) },
    { date: "2026-10-01", currency: "UF", rate: rate(41_200) },
  ]);
  const usd = row({
    kind: "foreign_currency",
    valuation_method: "fx",
    asset_code: "USD",
    flows: [
      {
        id: "f1",
        occurred_on: "2026-01-10",
        amount_minor: "1400000",
        units: "1500.00000000",
        notes: null,
      },
    ],
  });

  it("vale las unidades por la cotizacion de hoy, sin valorizar a mano", () => {
    const view = buildHoldingView(usd, TODAY, book);
    expect(view.metrics.valueMinor).toBe(1_440_000n);
    expect(view.metrics.gainMinor).toBe(40_000n);
    expect(view.metrics.unitsHeld).toBe(150_000_000_000n);
    expect(view.metrics.unitPrice).toBe(960_000_000n);
    expect(view.assetCode).toBe("USD");
  });

  it("calcula la rentabilidad real contra la UF", () => {
    const view = buildHoldingView(usd, TODAY, book);
    expect(view.metrics.annualizedPercent).not.toBeNull();
    // La UF subio 3 % en ~264 dias; la TIR anual del dolar es mayor o menor, pero
    // lo importante: hay un valor real calculado y distinto del nominal.
    expect(view.realAnnualPercent).not.toBeNull();
    expect(view.realAnnualPercent).not.toBe(view.metrics.annualizedPercent);
  });

  it("sin UF en el libro, la rentabilidad real queda en null", () => {
    const noUf = new RateBook([
      { date: "2026-01-10", currency: "USD", rate: rate(933.33) },
      { date: "2026-09-30", currency: "USD", rate: rate(960) },
    ]);
    expect(buildHoldingView(usd, TODAY, noUf).realAnnualPercent).toBeNull();
  });
});

describe("criptomoneda con puntos de precio guardados", () => {
  it("vale unidades x ultimo precio guardado", () => {
    const view = buildHoldingView(
      row({
        kind: "crypto",
        valuation_method: "crypto",
        asset_code: "BTC",
        flows: [
          {
            id: "f1",
            occurred_on: "2026-08-01",
            amount_minor: "180000",
            units: "0.00200000",
            notes: null,
          },
        ],
        valuations: [
          {
            id: "v1",
            valued_on: "2026-09-30",
            value_minor: "190000",
            unit_price: "95000000.000000",
            source: "coingecko",
          },
        ],
      }),
      TODAY,
      new RateBook([]),
    );
    expect(view.metrics.valueMinor).toBe(190_000n); // 0,002 x 95.000.000
    expect(view.metrics.gainMinor).toBe(10_000n);
    expect(view.valuations[0].source).toBe("coingecko");
  });
});

describe("deposito a plazo", () => {
  const dap = row({
    kind: "fixed_term_deposit",
    valuation_method: "fixed_term",
    term_start: "2026-09-01",
    term_end: "2026-12-01",
    rate_percent: "0.4500",
    rate_period: "monthly",
    flows: [
      {
        id: "f1",
        occurred_on: "2026-09-01",
        amount_minor: "1000000",
        units: null,
        notes: null,
      },
    ],
  });

  it("calcula el interes devengado y lo que habra al vencer", () => {
    const view = buildHoldingView(dap, TODAY, new RateBook([]));
    expect(view.metrics.valueMinor).toBe(1_004_500n);
    expect(view.maturity).toEqual({
      end: "2026-12-01",
      days: 61,
      accruedMinor: 4_500n,
      totalAtMaturityMinor: 1_013_650n,
    });
  });

  it("lee las condiciones de la fila", () => {
    expect(termsFromRow(dap)).toEqual({
      start: "2026-09-01",
      end: "2026-12-01",
      ratePercentScaled: 4_500n,
      period: "monthly",
    });
    expect(termsFromRow(row())).toBeNull();
  });

  it("un deposito con condiciones incompletas se valora a costo en vez de fallar", () => {
    const broken = row({ valuation_method: "fixed_term", flows: dap.flows });
    const view = buildHoldingView(broken, TODAY, new RateBook([]));
    expect(view.metrics.valueMinor).toBe(1_000_000n);
    expect(view.maturity).toBeNull();
  });
});

describe("rentabilidad de los ultimos 30 dias", () => {
  it("se calcula con la valorizacion de hace un mes y la de hoy", () => {
    const view = buildHoldingView(
      row({
        flows: [
          {
            id: "f1",
            occurred_on: "2026-01-01",
            amount_minor: "1000000",
            units: null,
            notes: null,
          },
        ],
        valuations: [
          {
            id: "v1",
            valued_on: "2026-09-01",
            value_minor: "1000000",
            unit_price: null,
            source: "manual",
          },
          {
            id: "v2",
            valued_on: "2026-10-01",
            value_minor: "1020000",
            unit_price: null,
            source: "manual",
          },
        ],
      }),
      TODAY,
      new RateBook([]),
    );
    expect(view.monthReturnPercent).toBe(2);
  });

  it("un instrumento nuevo no inventa rentabilidad mensual", () => {
    const view = buildHoldingView(
      row({
        flows: [
          {
            id: "f1",
            occurred_on: "2026-09-28",
            amount_minor: "1000000",
            units: null,
            notes: null,
          },
        ],
      }),
      TODAY,
      new RateBook([]),
    );
    expect(view.monthReturnPercent).toBeNull();
  });
});
