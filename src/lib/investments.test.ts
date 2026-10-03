import { describe, expect, it } from "vitest";
import {
  allocationByKind,
  holdingMetrics as metrics,
  holdingValueAt as valueAt,
  percentOf,
  xirr,
  type HoldingSpec,
} from "./investments";

const MANUAL: HoldingSpec = { method: "manual", currency: "CLP" };

// Atajos con la firma antigua: (flujos, valorizaciones, fecha).
const holdingValueAt = (
  flows: Parameters<typeof valueAt>[1],
  valuations: Parameters<typeof valueAt>[2],
  date: string,
) => valueAt(MANUAL, flows, valuations, null, date);
const holdingMetrics = (
  flows: Parameters<typeof metrics>[1],
  valuations: Parameters<typeof metrics>[2],
  today: string,
) => metrics(MANUAL, flows, valuations, null, today);

const flows = [
  { occurredOn: "2026-01-10", amountMinor: 1000000n },
  { occurredOn: "2026-06-10", amountMinor: 500000n },
];

describe("holdingValueAt", () => {
  it("sin valorizaciones el valor es lo aportado, a costo", () => {
    const v = holdingValueAt(flows, [], "2026-10-01");
    expect(v).toEqual({ valueMinor: 1500000n, valued: false, valuedOn: null });
  });

  it("antes del primer flujo vale cero", () => {
    expect(holdingValueAt(flows, [], "2025-12-31").valueMinor).toBe(0n);
  });

  it("usa la ultima valorizacion hasta la fecha", () => {
    const valuations = [
      { valuedOn: "2026-03-01", valueMinor: 1050000n },
      { valuedOn: "2026-09-01", valueMinor: 1700000n },
    ];
    expect(holdingValueAt(flows, valuations, "2026-05-01").valueMinor).toBe(1050000n);
    expect(holdingValueAt(flows, valuations, "2026-10-01")).toEqual({
      valueMinor: 1700000n,
      valued: true,
      valuedOn: "2026-09-01",
    });
  });

  it("un aporte posterior a la valorizacion suma al valor; el del mismo dia ya esta incluido", () => {
    const valuations = [{ valuedOn: "2026-06-10", valueMinor: 1600000n }];
    // El aporte del 10-jun es del mismo dia: incluido en los 1.600.000.
    expect(holdingValueAt(flows, valuations, "2026-07-01").valueMinor).toBe(1600000n);
    const later = [...flows, { occurredOn: "2026-08-01", amountMinor: 200000n }];
    expect(holdingValueAt(later, valuations, "2026-09-01").valueMinor).toBe(1800000n);
    expect(holdingValueAt(later, valuations, "2026-07-01").valueMinor).toBe(1600000n);
  });

  it("antes de la primera valorizacion cae al valor a costo", () => {
    const valuations = [{ valuedOn: "2026-09-01", valueMinor: 1700000n }];
    expect(holdingValueAt(flows, valuations, "2026-03-01")).toMatchObject({
      valueMinor: 1000000n,
      valued: false,
    });
  });

  it("un retiro baja el valor y nunca queda negativo", () => {
    const withWithdrawal = [
      ...flows,
      { occurredOn: "2026-07-01", amountMinor: -400000n },
    ];
    expect(holdingValueAt(withWithdrawal, [], "2026-08-01").valueMinor).toBe(1100000n);
    const overdrawn = [{ occurredOn: "2026-01-01", amountMinor: -50n }];
    expect(holdingValueAt(overdrawn, [], "2026-02-01").valueMinor).toBe(0n);
  });
});

describe("percentOf", () => {
  it("2 decimales hacia cero, con signo, y null sin base", () => {
    expect(percentOf(150000n, 1500000n)).toBe(10);
    expect(percentOf(-1n, 3n)).toBe(-33.33);
    expect(percentOf(1n, 0n)).toBeNull();
  });
});

describe("xirr", () => {
  it("1.000 que se vuelven 1.100 en un anio = 10%", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ])!;
    expect(r).toBeCloseTo(0.1, 4);
  });

  it("una perdida da tasa negativa", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 900 },
    ])!;
    expect(r).toBeCloseTo(-0.1, 4);
  });

  it("con varios aportes pondera por el tiempo que cada uno estuvo invertido", () => {
    // 1.000 al inicio y 1.000 a los 6 meses; al anio valen 2.200.
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-07-02", amount: -1000 },
      { date: "2026-01-01", amount: 2200 },
    ])!;
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.3);
  });

  it("menos de 30 dias de historia, o sin los dos signos: null", () => {
    expect(
      xirr([
        { date: "2026-10-01", amount: -1000 },
        { date: "2026-10-15", amount: 1100 },
      ]),
    ).toBeNull();
    expect(
      xirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2026-01-01", amount: -50 },
      ]),
    ).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
  });
});

describe("holdingMetrics", () => {
  it("ganancia = valor + retirado - aportado, y rentabilidad sobre lo aportado", () => {
    const m = holdingMetrics(
      flows,
      [{ valuedOn: "2026-09-30", valueMinor: 1650000n }],
      "2026-10-01",
    );
    expect(m.investedMinor).toBe(1500000n);
    expect(m.valueMinor).toBe(1650000n);
    expect(m.gainMinor).toBe(150000n);
    expect(m.returnPercent).toBe(10);
    expect(m.annualizedPercent).not.toBeNull();
    expect(m.annualizedPercent!).toBeGreaterThan(0);
  });

  it("los retiros cuentan como plata recuperada", () => {
    const m = holdingMetrics(
      [
        { occurredOn: "2026-01-10", amountMinor: 1000000n },
        { occurredOn: "2026-06-10", amountMinor: -300000n },
      ],
      [{ valuedOn: "2026-09-30", valueMinor: 800000n }],
      "2026-10-01",
    );
    expect(m.withdrawnMinor).toBe(300000n);
    expect(m.gainMinor).toBe(100000n); // 800.000 + 300.000 - 1.000.000
    expect(m.returnPercent).toBe(10);
  });

  it("sin valorizar no hay ganancia ni inventa rentabilidad", () => {
    const m = holdingMetrics(flows, [], "2026-10-01");
    expect(m.valued).toBe(false);
    expect(m.gainMinor).toBe(0n);
    expect(m.returnPercent).toBe(0);
  });

  it("los flujos con fecha futura todavia no cuentan", () => {
    const m = holdingMetrics(
      [...flows, { occurredOn: "2026-12-01", amountMinor: 999999n }],
      [],
      "2026-10-01",
    );
    expect(m.investedMinor).toBe(1500000n);
  });

  it("una historia corta no anualiza", () => {
    const m = holdingMetrics(
      [{ occurredOn: "2026-09-25", amountMinor: 1000000n }],
      [{ valuedOn: "2026-10-01", valueMinor: 1010000n }],
      "2026-10-01",
    );
    expect(m.returnPercent).toBe(1);
    expect(m.annualizedPercent).toBeNull();
  });

  it("sin aportes no hay rentabilidad", () => {
    expect(holdingMetrics([], [], "2026-10-01").returnPercent).toBeNull();
  });
});

describe("allocationByKind", () => {
  it("agrupa por tipo, ordena de mayor a menor y calcula el porcentaje", () => {
    const rows = allocationByKind([
      { kind: "fixed_term_deposit", valueMinor: 500000n },
      { kind: "mutual_fund", valueMinor: 300000n },
      { kind: "fixed_term_deposit", valueMinor: 200000n },
      { kind: "crypto", valueMinor: 0n },
    ]);
    expect(rows).toEqual([
      { kind: "fixed_term_deposit", valueMinor: 700000n, percent: 70 },
      { kind: "mutual_fund", valueMinor: 300000n, percent: 30 },
    ]);
  });

  it("sin valor no hay reparto", () => {
    expect(allocationByKind([])).toEqual([]);
  });
});
