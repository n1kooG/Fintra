import { describe, expect, it } from "vitest";
import {
  cardEvents,
  groupByDate,
  loanEvents,
  maturityEvents,
  monthGrid,
  recurringEvents,
  sortEvents,
  weekOf,
} from "./calendar";
import { amortizationSchedule } from "./loans";

describe("monthGrid", () => {
  it("octubre 2026 parte un jueves: semanas de lunes a domingo, huecos en null", () => {
    const grid = monthGrid("2026-10");
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(grid[4].slice(0, 5)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(grid[4][5]).toBe("2026-10-31");
    expect(grid[4][6]).toBeNull();
  });

  it("cada semana tiene 7 celdas y el mes aparece completo", () => {
    for (const month of ["2026-02", "2026-03", "2028-02", "2026-11"]) {
      const grid = monthGrid(month);
      expect(grid.every((week) => week.length === 7)).toBe(true);
      const days = grid.flat().filter(Boolean);
      expect(days[0]).toBe(`${month}-01`);
      expect(new Set(days).size).toBe(days.length);
    }
    expect(monthGrid("2026-02").flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });

  it("un mes que parte lunes no tiene huecos al inicio", () => {
    expect(monthGrid("2026-06")[0][0]).toBe("2026-06-01");
  });
});

describe("weekOf", () => {
  it("lunes a domingo, tambien al cruzar de mes", () => {
    expect(weekOf("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weekOf("2026-10-05")[0]).toBe("2026-10-05");
    expect(weekOf("2026-10-04")[0]).toBe("2026-09-28");
  });
});

const RANGE = { from: "2026-10-01", to: "2026-10-31" };

describe("recurringEvents", () => {
  const rules = [
    {
      id: "arriendo",
      type: "expense" as const,
      label: "Arriendo",
      amountMinor: 420000n,
      currency: "CLP" as const,
      frequency: "monthly" as const,
      startDate: "2026-01-10",
      endDate: null,
      nextRunOn: "2026-10-10",
      active: true,
    },
    {
      id: "sueldo",
      type: "income" as const,
      label: "Sueldo",
      amountMinor: 1850000n,
      currency: "CLP" as const,
      frequency: "monthly" as const,
      startDate: "2026-01-14",
      endDate: null,
      nextRunOn: "2026-10-14",
      active: true,
    },
    {
      id: "pausada",
      type: "expense" as const,
      label: "Gimnasio",
      amountMinor: 30000n,
      currency: "CLP" as const,
      frequency: "monthly" as const,
      startDate: "2026-01-20",
      endDate: null,
      nextRunOn: "2026-10-20",
      active: false,
    },
  ];

  it("proyecta las reglas activas con signo y deja fuera las pausadas", () => {
    const events = recurringEvents({ rules, generated: [], ...RANGE });
    expect(events.map((e) => [e.date, e.label, e.amountMinor])).toEqual([
      ["2026-10-10", "Arriendo", -420000n],
      ["2026-10-14", "Sueldo", 1850000n],
    ]);
  });

  it("lo ya generado sale de los movimientos reales y no se duplica con la regla", () => {
    // El sueldo del 14 ya se genero (nextRunOn paso al mes siguiente).
    const events = recurringEvents({
      rules: [{ ...rules[1], nextRunOn: "2026-11-14" }],
      generated: [
        {
          id: "t1",
          date: "2026-10-14",
          type: "income",
          label: "Sueldo",
          amountMinor: 1850000n,
          currency: "CLP",
        },
        {
          id: "t0",
          date: "2026-09-14",
          type: "income",
          label: "Sueldo",
          amountMinor: 1850000n,
          currency: "CLP",
        },
      ],
      ...RANGE,
    });
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-10-14");
  });

  it("respeta la fecha de termino de la regla", () => {
    const events = recurringEvents({
      rules: [{ ...rules[0], endDate: "2026-10-05" }],
      generated: [],
      ...RANGE,
    });
    expect(events).toEqual([]);
  });
});

describe("cardEvents", () => {
  const cards = [
    { id: "cmr", name: "CMR", currency: "CLP" as const, closeDay: 22, dueDay: 5 },
    {
      id: "sin-config",
      name: "Otra",
      currency: "CLP" as const,
      closeDay: null,
      dueDay: null,
    },
  ];
  const plans = [
    {
      id: "p1",
      accountId: "cmr",
      totalMinor: 270000n,
      count: 6,
      firstDueDate: "2026-08-05",
      dueDay: 5,
    },
    {
      id: "p2",
      accountId: "cmr",
      totalMinor: 390000n,
      count: 12,
      firstDueDate: "2026-03-05",
      dueDay: 5,
    },
    {
      id: "p3",
      accountId: "cmr",
      totalMinor: 56700n,
      count: 3,
      firstDueDate: "2026-10-05",
      dueDay: 5,
    },
  ];

  const events = cardEvents({ cards, plans, charges: [], ...RANGE, today: "2026-09-24" });

  it("facturacion en el vencimiento = suma de cuotas (96.400), con el estado de cuenta ya cerrado", () => {
    const bill = events.find(
      (e) => e.kind === "card_billing" && e.date === "2026-10-05",
    )!;
    expect(bill.amountMinor).toBe(-96400n);
    expect(bill.estimated).toBe(false);
    expect(bill.label).toBe("Facturación CMR");
  });

  it("marca el cierre del ciclo, sin monto", () => {
    const close = events.find((e) => e.kind === "card_close")!;
    expect(close.date).toBe("2026-10-22");
    expect(close.amountMinor).toBeNull();
  });

  it("ignora tarjetas sin ciclo configurado", () => {
    expect(events.every((e) => !e.id.includes("sin-config"))).toBe(true);
  });

  it("la facturacion de un ciclo abierto o futuro se marca como estimada", () => {
    const november = cardEvents({
      cards,
      plans,
      charges: [{ accountId: "cmr", date: "2026-10-03", amountMinor: 20000n }],
      from: "2026-11-01",
      to: "2026-11-30",
      today: "2026-10-15",
    });
    const bill = november.find((e) => e.kind === "card_billing")!;
    expect(bill.date).toBe("2026-11-05");
    expect(bill.estimated).toBe(true);
    // Cierra el 22-oct (aun no): compra de contado del 3-oct + cuotas de noviembre (96.400).
    expect(bill.amountMinor).toBe(-(20000n + 96400n));
  });

  it("una facturacion ya pagada deja de aparecer; una pagada en parte baja a lo que falta", () => {
    const base = { cards, plans, charges: [], ...RANGE, today: "2026-09-24" };
    const paidInFull = cardEvents({
      ...base,
      payments: [{ accountId: "cmr", date: "2026-10-01", amountMinor: 96_400n }],
    });
    expect(
      paidInFull.some((e) => e.kind === "card_billing" && e.date === "2026-10-05"),
    ).toBe(false);

    const partial = cardEvents({
      ...base,
      payments: [{ accountId: "cmr", date: "2026-10-01", amountMinor: 30_000n }],
    });
    const bill = partial.find(
      (e) => e.kind === "card_billing" && e.date === "2026-10-05",
    )!;
    expect(bill.amountMinor).toBe(-66_400n);
  });

  it("un pago a otra tarjeta, o fuera de la ventana, no cuenta", () => {
    const events = cardEvents({
      cards,
      plans,
      charges: [],
      ...RANGE,
      today: "2026-09-24",
      payments: [
        { accountId: "otra", date: "2026-10-01", amountMinor: 96_400n },
        { accountId: "cmr", date: "2026-09-10", amountMinor: 96_400n }, // antes del cierre
      ],
    });
    expect(
      events.find((e) => e.kind === "card_billing" && e.date === "2026-10-05")!
        .amountMinor,
    ).toBe(-96_400n);
  });

  it("sin nada que cobrar no inventa una facturacion en cero", () => {
    const empty = cardEvents({
      cards,
      plans: [],
      charges: [],
      ...RANGE,
      today: "2026-09-24",
    });
    expect(empty.some((e) => e.kind === "card_billing")).toBe(false);
  });
});

describe("loanEvents", () => {
  const { rows } = amortizationSchedule({
    principalMinor: 540000n,
    installmentMinor: 180000n,
    count: 3,
    firstDueDate: "2026-10-10",
  })!;

  it("una cuota por mes dentro del rango, con numero y signo negativo", () => {
    const events = loanEvents({
      loans: [{ id: "auto", name: "Préstamo auto", currency: "CLP", rows }],
      ...RANGE,
    });
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-10-10");
    expect(events[0].amountMinor).toBe(-180000n);
    expect(events[0].label).toBe("Cuota Préstamo auto (1/3)");
  });
});

describe("sortEvents / groupByDate", () => {
  it("ordena por fecha y, el mismo dia, ingresos primero y gastos al final", () => {
    const base = { currency: "CLP" as const, estimated: false };
    const events = [
      {
        ...base,
        id: "a",
        date: "2026-10-10",
        kind: "expense" as const,
        label: "Arriendo",
        amountMinor: -1n,
      },
      {
        ...base,
        id: "b",
        date: "2026-10-10",
        kind: "loan" as const,
        label: "Cuota",
        amountMinor: -1n,
      },
      {
        ...base,
        id: "c",
        date: "2026-10-09",
        kind: "income" as const,
        label: "Sueldo",
        amountMinor: 1n,
      },
      {
        ...base,
        id: "d",
        date: "2026-10-10",
        kind: "income" as const,
        label: "Otro",
        amountMinor: 1n,
      },
    ];
    expect(sortEvents(events).map((e) => e.id)).toEqual(["c", "d", "b", "a"]);
    const grouped = groupByDate(events);
    expect([...grouped.keys()]).toEqual(["2026-10-09", "2026-10-10"]);
    expect(grouped.get("2026-10-10")).toHaveLength(3);
  });
});

describe("maturityEvents", () => {
  const deposits = [
    {
      id: "d1",
      name: "DAP BancoEstado",
      currency: "CLP" as const,
      end: "2026-12-01",
      totalMinor: 1_013_650n,
    },
    {
      id: "d2",
      name: "DAP Lejano",
      currency: "CLP" as const,
      end: "2027-06-01",
      totalMinor: 5n,
    },
  ];

  it("crea un evento por deposito que vence dentro del rango, con lo que se recibe", () => {
    const events = maturityEvents({ deposits, from: "2026-11-01", to: "2026-12-31" });
    expect(events).toEqual([
      {
        id: "maturity:d1:2026-12-01",
        date: "2026-12-01",
        kind: "deposit_maturity",
        label: "Vence DAP BancoEstado",
        amountMinor: 1_013_650n,
        currency: "CLP",
        estimated: false,
      },
    ]);
  });

  it("el rango es inclusivo en ambos extremos", () => {
    expect(
      maturityEvents({ deposits, from: "2026-12-01", to: "2026-12-01" }),
    ).toHaveLength(1);
    expect(
      maturityEvents({ deposits, from: "2026-12-02", to: "2027-01-01" }),
    ).toHaveLength(0);
  });

  it("se ordena con los demas eventos del dia", () => {
    const sorted = sortEvents([
      ...maturityEvents({ deposits, from: "2026-12-01", to: "2026-12-01" }),
      {
        id: "x",
        date: "2026-12-01",
        kind: "expense",
        label: "A",
        amountMinor: -1n,
        currency: "CLP",
        estimated: false,
      },
    ]);
    expect(sorted.map((e) => e.kind)).toEqual(["deposit_maturity", "expense"]);
  });
});
