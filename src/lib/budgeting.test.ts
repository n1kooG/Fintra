import { describe, expect, it } from "vitest";
import { RateBook, parseRate } from "./fx";
import { buildBudgetMonth, budgetStatus, rolloverCarry, safeToSpend } from "./budgeting";
import type { ReportTransaction } from "./reports";

describe("budgetStatus", () => {
  it("ok por debajo del 80%", () => {
    expect(budgetStatus(0n, 100000n)).toEqual({ percent: 0, status: "ok" });
    expect(budgetStatus(79999n, 100000n)).toEqual({ percent: 79, status: "ok" });
  });

  it("warning desde el 80% hasta antes del 100%", () => {
    expect(budgetStatus(80000n, 100000n)).toEqual({ percent: 80, status: "warning" });
    expect(budgetStatus(99999n, 100000n)).toEqual({ percent: 99, status: "warning" });
  });

  it("over al llegar al tope y pasado (el porcentaje puede superar 100)", () => {
    expect(budgetStatus(100000n, 100000n)).toEqual({ percent: 100, status: "over" });
    expect(budgetStatus(150000n, 100000n)).toEqual({ percent: 150, status: "over" });
  });

  it("presupuesto en cero: cualquier gasto es over, sin dividir por cero", () => {
    expect(budgetStatus(0n, 0n)).toEqual({ percent: 0, status: "ok" });
    expect(budgetStatus(5n, 0n)).toEqual({ percent: 0, status: "over" });
  });
});

describe("safeToSpend", () => {
  it("divide lo que queda por los dias restantes contando hoy", () => {
    // 24 de octubre: quedan 24, 25... 31 = 8 dias.
    const s = safeToSpend(80000n, "2026-10-24");
    expect(s.daysLeft).toBe(8);
    expect(s.perDayMinor).toBe(10000n);
  });

  it("redondea hacia abajo", () => {
    expect(safeToSpend(100n, "2026-10-24").perDayMinor).toBe(12n);
  });

  it("el ultimo dia del mes queda 1 dia", () => {
    const s = safeToSpend(5000n, "2026-10-31");
    expect(s.daysLeft).toBe(1);
    expect(s.perDayMinor).toBe(5000n);
  });

  it("sin saldo (o pasado de presupuesto) no hay nada por dia", () => {
    expect(safeToSpend(0n, "2026-10-24").perDayMinor).toBe(0n);
    expect(safeToSpend(-20000n, "2026-10-24").perDayMinor).toBe(0n);
  });
});

const book = new RateBook([
  { date: "2026-10-01", currency: "USD", rate: parseRate("1000")! },
]);

const expense = (
  categoryId: string | null,
  amountMinor: number,
  currency: "CLP" | "USD" = "CLP",
  occurredOn = "2026-10-10",
): ReportTransaction => ({
  type: "expense",
  amount_minor: String(-amountMinor),
  currency,
  fx_rate: null,
  occurred_on: occurredOn,
  category_id: categoryId,
  category: categoryId ? { id: categoryId, name: categoryId } : null,
});

describe("buildBudgetMonth", () => {
  const budgets = [
    {
      id: "b1",
      categoryId: "super",
      categoryName: "Supermercado",
      amountMinor: 200000n,
      currency: "CLP" as const,
    },
    {
      id: "b2",
      categoryId: "resto",
      categoryName: "Restaurantes",
      amountMinor: 100000n,
      currency: "CLP" as const,
    },
  ];
  const expenses = [
    expense("super", 144000),
    expense("resto", 95000),
    expense("resto", 500, "USD"), // US$5 = $5.000
    expense("otros", 30000), // sin presupuesto
    expense(null, 10000), // sin categoria
    { ...expense("super", 0), type: "income" as const, amount_minor: "999999" },
  ];

  const month = buildBudgetMonth({
    monthKey: "2026-10",
    today: "2026-10-24",
    display: "CLP",
    budgets,
    expenses,
    book,
  });

  it("calcula gastado, avance y estado por categoria (USD convertido a la moneda del presupuesto)", () => {
    const resto = month.lines.find((l) => l.categoryId === "resto")!;
    expect(resto.spentMinor).toBe(100000n);
    expect(resto.status).toBe("over");
    const supermercado = month.lines.find((l) => l.categoryId === "super")!;
    expect(supermercado.spentMinor).toBe(144000n);
    expect(supermercado.percent).toBe(72);
    expect(supermercado.status).toBe("ok");
    expect(supermercado.remainingMinor).toBe(56000n);
  });

  it("ordena por nombre de categoria", () => {
    expect(month.lines.map((l) => l.categoryName)).toEqual([
      "Restaurantes",
      "Supermercado",
    ]);
  });

  it("totales solo con categorias presupuestadas, y el resto aparte", () => {
    expect(month.totals).toEqual({
      budgetMinor: 300000n,
      spentMinor: 244000n,
      remainingMinor: 56000n,
      committedMinor: 0n,
      availableMinor: 56000n,
    });
    expect(month.unbudgetedSpentMinor).toBe(40000n);
    expect(month.unconverted).toBe(0);
  });

  it("el mes en curso trae disponible por dia", () => {
    expect(month.isCurrent).toBe(true);
    expect(month.safe).toEqual({
      remainingMinor: 56000n,
      daysLeft: 8,
      perDayMinor: 7000n,
    });
  });

  it("un mes pasado o futuro no trae disponible por dia", () => {
    const past = buildBudgetMonth({
      monthKey: "2026-09",
      today: "2026-10-24",
      display: "CLP",
      budgets,
      expenses: [],
      book,
    });
    expect(past.isCurrent).toBe(false);
    expect(past.safe).toBeNull();
  });

  it("un presupuesto en USD se mide en USD y se consolida a CLP con la cotizacion del dia", () => {
    const m = buildBudgetMonth({
      monthKey: "2026-10",
      today: "2026-10-24",
      display: "CLP",
      budgets: [
        {
          id: "b",
          categoryId: "viajes",
          categoryName: "Viajes",
          amountMinor: 10000n,
          currency: "USD",
        },
      ],
      expenses: [expense("viajes", 50000)], // $50.000 = US$50
      book,
    });
    expect(m.lines[0].spentMinor).toBe(5000n);
    expect(m.lines[0].percent).toBe(50);
    expect(m.totals).toEqual({
      budgetMinor: 100000n,
      spentMinor: 50000n,
      remainingMinor: 50000n,
      committedMinor: 0n,
      availableMinor: 50000n,
    });
  });

  it("sin cotizacion no inventa numeros: lo deja fuera y lo informa", () => {
    const m = buildBudgetMonth({
      monthKey: "2026-10",
      today: "2026-10-24",
      display: "CLP",
      budgets,
      expenses: [expense("super", 100, "USD")],
      book: new RateBook([]),
    });
    expect(m.unconverted).toBe(1);
    expect(m.lines.find((l) => l.categoryId === "super")!.unconverted).toBe(1);
    expect(m.totals.spentMinor).toBe(0n);
  });

  it("sin presupuestos no hay totales ni disponible por dia", () => {
    const m = buildBudgetMonth({
      monthKey: "2026-10",
      today: "2026-10-24",
      display: "CLP",
      budgets: [],
      expenses,
      book,
    });
    expect(m.lines).toEqual([]);
    expect(m.safe).toBeNull();
    // Todo el gasto del mes queda "sin presupuesto": 144.000 + 95.000 + 5.000 + 30.000 + 10.000.
    expect(m.unbudgetedSpentMinor).toBe(284000n);
  });
});

describe("arrastre del sobrante", () => {
  const base = {
    monthKey: "2026-10",
    today: "2026-10-24",
    display: "CLP" as const,
    book,
  };
  const prior = {
    id: "p",
    categoryId: "super",
    categoryName: "Super",
    amountMinor: 200000n,
    currency: "CLP" as const,
  };
  const current = { ...prior, id: "c", rollover: true };

  it("rolloverCarry: lo que sobro, nunca negativo", () => {
    expect(rolloverCarry(prior, [expense("super", 150000)], book)).toBe(50000n);
    expect(rolloverCarry(prior, [expense("super", 250000)], book)).toBe(0n);
    expect(rolloverCarry(prior, [], book)).toBe(200000n);
  });

  it("un presupuesto con arrastre suma lo que sobro y su estado usa el tope efectivo", () => {
    const m = buildBudgetMonth({
      ...base,
      budgets: [current],
      expenses: [expense("super", 220000)],
      previous: {
        budgets: [prior],
        expenses: [expense("super", 150000, "CLP", "2026-09-10")],
      },
    });
    const line = m.lines[0];
    expect(line.baseMinor).toBe(200000n);
    expect(line.carryMinor).toBe(50000n);
    expect(line.amountMinor).toBe(250000n);
    expect(line.remainingMinor).toBe(30000n);
    expect(line.percent).toBe(88);
    expect(m.totals.budgetMinor).toBe(250000n);
  });

  it("sin la marca de arrastre no suma nada, aunque haya sobrado", () => {
    const m = buildBudgetMonth({
      ...base,
      budgets: [{ ...current, rollover: false }],
      expenses: [],
      previous: { budgets: [prior], expenses: [] },
    });
    expect(m.lines[0].carryMinor).toBe(0n);
    expect(m.lines[0].amountMinor).toBe(200000n);
  });

  it("si el mes anterior no tenia presupuesto en esa categoria, no hay arrastre", () => {
    const m = buildBudgetMonth({
      ...base,
      budgets: [current],
      expenses: [],
      previous: { budgets: [], expenses: [] },
    });
    expect(m.lines[0].carryMinor).toBe(0n);
  });

  it("un exceso del mes anterior no se arrastra", () => {
    const m = buildBudgetMonth({
      ...base,
      budgets: [current],
      expenses: [],
      previous: {
        budgets: [prior],
        expenses: [expense("super", 300000, "CLP", "2026-09-10")],
      },
    });
    expect(m.lines[0].carryMinor).toBe(0n);
  });
});

describe("disponible real (recurrentes que faltan)", () => {
  const input = {
    monthKey: "2026-10",
    today: "2026-10-24",
    display: "CLP" as const,
    book,
    budgets: [
      {
        id: "b1",
        categoryId: "arriendo",
        categoryName: "Arriendo",
        amountMinor: 500000n,
        currency: "CLP" as const,
      },
      {
        id: "b2",
        categoryId: "super",
        categoryName: "Super",
        amountMinor: 200000n,
        currency: "CLP" as const,
      },
    ],
    expenses: [expense("super", 120000)],
  };

  it("descuenta de la categoria lo recurrente que todavia no ocurre", () => {
    const m = buildBudgetMonth({
      ...input,
      commitments: [{ categoryId: "arriendo", amountMinor: 450000n, currency: "CLP" }],
    });
    const arriendo = m.lines.find((l) => l.categoryId === "arriendo")!;
    expect(arriendo.committedMinor).toBe(450000n);
    expect(arriendo.remainingMinor).toBe(500000n);
    expect(arriendo.availableMinor).toBe(50000n);
    expect(m.totals.remainingMinor).toBe(580000n);
    expect(m.totals.committedMinor).toBe(450000n);
    expect(m.totals.availableMinor).toBe(130000n);
  });

  it("el disponible por dia usa el disponible real", () => {
    const m = buildBudgetMonth({
      ...input,
      commitments: [{ categoryId: "arriendo", amountMinor: 450000n, currency: "CLP" }],
    });
    // 130.000 / 8 dias (24 al 31 de octubre)
    expect(m.safe!.remainingMinor).toBe(130000n);
    expect(m.safe!.perDayMinor).toBe(16250n);
  });

  it("un recurrente en USD se convierte a la moneda del presupuesto", () => {
    const m = buildBudgetMonth({
      ...input,
      commitments: [{ categoryId: "super", amountMinor: 5000n, currency: "USD" }], // US$50 = $50.000
    });
    expect(m.lines.find((l) => l.categoryId === "super")!.committedMinor).toBe(50000n);
  });

  it("lo recurrente de una categoria sin presupuesto no resta del disponible por categoria", () => {
    const m = buildBudgetMonth({
      ...input,
      commitments: [{ categoryId: "gimnasio", amountMinor: 30000n, currency: "CLP" }],
    });
    expect(m.totals.committedMinor).toBe(0n);
  });
});

describe("tope total del mes", () => {
  const input = {
    monthKey: "2026-10",
    today: "2026-10-24",
    display: "CLP" as const,
    book,
    budgets: [
      {
        id: "b1",
        categoryId: "super",
        categoryName: "Super",
        amountMinor: 200000n,
        currency: "CLP" as const,
      },
    ],
    expenses: [expense("super", 120000), expense("otros", 80000), expense(null, 20000)],
    totalCap: { id: "t", amountMinor: 500000n, currency: "CLP" as const },
  };

  it("mide TODO el gasto del mes, con o sin presupuesto por categoria", () => {
    const m = buildBudgetMonth(input);
    expect(m.total).toMatchObject({
      capMinor: 500000n,
      spentMinor: 220000n,
      remainingMinor: 280000n,
      percent: 44,
      status: "ok",
    });
  });

  it("descuenta todos los recurrentes que faltan, tengan o no presupuesto", () => {
    const m = buildBudgetMonth({
      ...input,
      commitments: [
        { categoryId: "gimnasio", amountMinor: 30000n, currency: "CLP" },
        { categoryId: "super", amountMinor: 20000n, currency: "CLP" },
      ],
    });
    expect(m.total!.committedMinor).toBe(50000n);
    expect(m.total!.remainingMinor).toBe(230000n);
  });

  it("manda sobre el por dia: 280.000 / 8 dias", () => {
    const m = buildBudgetMonth(input);
    expect(m.safe!.remainingMinor).toBe(280000n);
    expect(m.safe!.perDayMinor).toBe(35000n);
  });

  it("se pasa del tope: estado over y nada por dia", () => {
    const m = buildBudgetMonth({ ...input, expenses: [expense("otros", 600000)] });
    expect(m.total!.status).toBe("over");
    expect(m.safe!.perDayMinor).toBe(0n);
  });

  it("solo con tope total (sin presupuestos por categoria) igual hay por dia", () => {
    const m = buildBudgetMonth({ ...input, budgets: [] });
    expect(m.lines).toEqual([]);
    expect(m.safe).not.toBeNull();
    expect(m.total!.spentMinor).toBe(220000n);
  });

  it("un tope en USD se consolida a la moneda de visualizacion", () => {
    const m = buildBudgetMonth({
      ...input,
      totalCap: { id: "t", amountMinor: 50000n, currency: "USD" }, // US$500 = $500.000
    });
    expect(m.total!.capMinor).toBe(500000n);
  });

  it("sin tope definido no hay total", () => {
    expect(buildBudgetMonth({ ...input, totalCap: null }).total).toBeNull();
  });
});
