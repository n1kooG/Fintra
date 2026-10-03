import { describe, expect, it } from "vitest";
import { RateBook, parseRate } from "./fx";
import {
  compareBreakdowns,
  delta,
  monthBreakdown,
  monthKeysEndingAt,
  monthlyTotals,
  savingsRatePercent,
  unusualExpenses,
} from "./analytics";
import type { ReportTransaction } from "./reports";

const book = new RateBook([
  { date: "2026-01-01", currency: "USD", rate: parseRate("1000")! },
]);

const tx = (
  date: string,
  type: "income" | "expense",
  amount: number,
  categoryId: string | null = null,
  currency: "CLP" | "USD" = "CLP",
): ReportTransaction => ({
  type,
  amount_minor: String(type === "expense" ? -amount : amount),
  currency,
  fx_rate: null,
  occurred_on: date,
  category_id: categoryId,
  category: categoryId ? { id: categoryId, name: categoryId } : null,
});

describe("monthKeysEndingAt", () => {
  it("del mas antiguo al mas reciente, cruzando de anio", () => {
    expect(monthKeysEndingAt("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthKeysEndingAt("2026-10", 1)).toEqual(["2026-10"]);
  });
});

describe("monthlyTotals", () => {
  const txs = [
    tx("2026-08-05", "income", 1000000),
    tx("2026-08-20", "expense", 400000, "super"),
    tx("2026-09-05", "income", 1000000),
    tx("2026-09-12", "expense", 500000, "super"),
    tx("2026-09-28", "expense", 5000, "viajes", "USD"), // US$50 = $50.000
  ];

  it("totales por mes, con los meses sin movimientos en cero", () => {
    const rows = monthlyTotals(txs, ["2026-07", "2026-08", "2026-09"], "CLP", book);
    expect(rows.map((r) => [r.monthKey, r.incomeMinor, r.expenseMinor])).toEqual([
      ["2026-07", 0n, 0n],
      ["2026-08", 1000000n, -400000n],
      ["2026-09", 1000000n, -550000n],
    ]);
    expect(rows[2].balanceMinor).toBe(450000n);
  });

  it("no mezcla meses distintos", () => {
    const rows = monthlyTotals(txs, ["2026-09"], "CLP", book);
    expect(rows[0].incomeMinor).toBe(1000000n);
  });
});

describe("delta", () => {
  it("variacion con 1 decimal sobre el valor absoluto anterior", () => {
    expect(delta(1084n, 1000n)).toMatchObject({ deltaMinor: 84n, deltaPercent: 8.4 });
    expect(delta(900n, 1000n).deltaPercent).toBe(-10);
  });

  it("sin base de comparacion no hay porcentaje", () => {
    expect(delta(500n, 0n).deltaPercent).toBeNull();
  });

  it("un balance negativo anterior usa su valor absoluto", () => {
    // Pasar de -100 a +50 es una mejora de +150%.
    expect(delta(50n, -100n).deltaPercent).toBe(150);
  });
});

describe("compareBreakdowns", () => {
  const current = [
    { categoryId: "super", name: "Supermercado", totalMinor: 500000n },
    { categoryId: "viajes", name: "Viajes", totalMinor: 100000n },
  ];
  const previous = [
    { categoryId: "super", name: "Supermercado", totalMinor: 400000n },
    { categoryId: "salud", name: "Salud", totalMinor: 80000n },
  ];
  const rows = compareBreakdowns(current, previous);

  it("une las categorias de ambos periodos, ordenadas por gasto actual", () => {
    expect(rows.map((r) => r.name)).toEqual(["Supermercado", "Viajes", "Salud"]);
  });

  it("variacion y participacion", () => {
    expect(rows[0]).toMatchObject({
      currentMinor: 500000n,
      previousMinor: 400000n,
      deltaPercent: 25,
    });
    expect(rows[0].sharePercent).toBeCloseTo(83.3, 1);
  });

  it("una categoria nueva no tiene porcentaje; una que desaparece baja a cero", () => {
    expect(rows[1]).toMatchObject({ previousMinor: 0n, deltaPercent: null });
    expect(rows[2]).toMatchObject({
      currentMinor: 0n,
      deltaPercent: -100,
      sharePercent: 0,
    });
  });

  it("sin datos devuelve vacio", () => {
    expect(compareBreakdowns([], [])).toEqual([]);
  });
});

describe("monthBreakdown", () => {
  it("solo cuenta los gastos del mes pedido", () => {
    const { rows } = monthBreakdown(
      [
        tx("2026-08-20", "expense", 400000, "super"),
        tx("2026-09-12", "expense", 500000, "super"),
      ],
      "2026-09",
      "CLP",
      book,
    );
    expect(rows).toEqual([{ categoryId: "super", name: "super", totalMinor: 500000n }]);
  });
});

describe("savingsRatePercent", () => {
  it("ahorro sobre ingresos, con un decimal", () => {
    expect(savingsRatePercent({ incomeMinor: 1_000_000n, expenseMinor: -750_000n })).toBe(
      25,
    );
    expect(savingsRatePercent({ incomeMinor: 3n, expenseMinor: -1n })).toBe(66.6);
  });

  it("negativa cuando se gasta mas de lo que entra", () => {
    expect(
      savingsRatePercent({ incomeMinor: 1_000_000n, expenseMinor: -1_200_000n }),
    ).toBe(-20);
  });

  it("sin ingresos no hay tasa", () => {
    expect(savingsRatePercent({ incomeMinor: 0n, expenseMinor: -50_000n })).toBeNull();
  });
});

describe("unusualExpenses", () => {
  const book = new RateBook([]);
  const exp = (id: string, date: string, amount: number, category = "resto") => ({
    id,
    type: "expense" as const,
    amount_minor: String(-amount),
    currency: "CLP" as const,
    fx_rate: null,
    occurred_on: date,
    category_id: category,
    category: { id: category, name: category },
    merchant: `m-${id}`,
  });
  const history = [
    exp("h1", "2026-07-05", 20_000),
    exp("h2", "2026-08-05", 25_000),
    exp("h3", "2026-09-05", 22_000),
    exp("h4", "2026-09-20", 18_000),
  ];

  it("marca un gasto de varias veces lo habitual en su categoria", () => {
    const found = unusualExpenses({
      transactions: [...history, exp("big", "2026-10-10", 120_000)],
      monthKey: "2026-10",
      display: "CLP",
      book,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "big",
      amountMinor: 120_000n,
      categoryName: "resto",
    });
    expect(found[0].typicalMinor).toBe(21_000n); // mediana de 18.000, 20.000, 22.000, 25.000
    expect(found[0].ratio).toBeGreaterThan(5);
  });

  it("no marca un gasto normal ni uno chico aunque sea raro", () => {
    const found = unusualExpenses({
      transactions: [
        ...history,
        exp("normal", "2026-10-10", 40_000), // < 2,5 x mediana
        exp("small", "2026-10-11", 1_000, "cafe"),
      ],
      monthKey: "2026-10",
      display: "CLP",
      book,
    });
    expect(found).toEqual([]);
  });

  it("necesita al menos 3 gastos previos de la categoria", () => {
    const found = unusualExpenses({
      transactions: [
        exp("a", "2026-09-01", 20_000),
        exp("b", "2026-09-02", 21_000),
        exp("big", "2026-10-10", 500_000),
      ],
      monthKey: "2026-10",
      display: "CLP",
      book,
    });
    expect(found).toEqual([]);
  });

  it("ignora ingresos, gastos sin categoria y meses posteriores al elegido", () => {
    const found = unusualExpenses({
      transactions: [
        ...history,
        { ...exp("inc", "2026-10-10", 500_000), type: "income" as const },
        { ...exp("nocat", "2026-10-11", 500_000), category_id: null, category: null },
        exp("future", "2026-11-10", 500_000),
      ],
      monthKey: "2026-10",
      display: "CLP",
      book,
    });
    expect(found).toEqual([]);
  });

  it("los mas grandes primero y con tope de resultados", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      exp(`x${i}`, "2026-10-10", 100_000 + i * 10_000),
    );
    const found = unusualExpenses({
      transactions: [...history, ...many],
      monthKey: "2026-10",
      display: "CLP",
      book,
      limit: 3,
    });
    expect(found.map((f) => f.id)).toEqual(["x7", "x6", "x5"]);
  });
});
