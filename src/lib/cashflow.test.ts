import { describe, expect, it } from "vitest";
import {
  capCardBillings,
  estimateVariableMonthly,
  parseScenario,
  pendingCashEvents,
  projectCashFlow,
  scaleVariable,
  type CashEvent,
} from "./cashflow";
import type { CalendarEvent } from "./calendar";

const totals = (entries: [string, bigint][]) => new Map(entries);

describe("estimateVariableMonthly", () => {
  it("promedia los ultimos 3 meses completos", () => {
    const e = estimateVariableMonthly({
      totalsByMonth: totals([
        ["2026-06", 400000n],
        ["2026-07", 500000n],
        ["2026-08", 600000n],
        ["2026-09", 700000n],
        ["2026-10", 100000n], // mes en curso: no entra
      ]),
      today: "2026-10-15",
    });
    // Jul, ago, sep; el primer mes con datos (jun) no entra por la ventana de 3.
    expect(e).toEqual({ monthlyMinor: 600000n, basis: "full_months", months: 3 });
  });

  it("descarta el primer mes con datos si hay otros (probablemente parcial)", () => {
    const e = estimateVariableMonthly({
      totalsByMonth: totals([
        ["2026-08", 50000n], // empezo a mitad de mes
        ["2026-09", 600000n],
        ["2026-10", 100000n],
      ]),
      today: "2026-10-15",
    });
    expect(e).toEqual({ monthlyMinor: 600000n, basis: "full_months", months: 1 });
  });

  it("con un solo mes previo lo usa aunque sea el primero", () => {
    const e = estimateVariableMonthly({
      totalsByMonth: totals([["2026-09", 300000n]]),
      today: "2026-10-15",
    });
    expect(e).toMatchObject({ monthlyMinor: 300000n, basis: "full_months", months: 1 });
  });

  it("sin meses completos prorratea el mes en curso", () => {
    const e = estimateVariableMonthly({
      totalsByMonth: totals([["2026-10", 150000n]]),
      today: "2026-10-15",
    });
    // 150.000 en 15 dias -> 31 dias.
    expect(e).toEqual({ monthlyMinor: 310000n, basis: "current_month", months: 0 });
  });

  it("sin datos no inventa nada", () => {
    expect(
      estimateVariableMonthly({ totalsByMonth: new Map(), today: "2026-10-15" }),
    ).toEqual({
      monthlyMinor: 0n,
      basis: "none",
      months: 0,
    });
  });
});

describe("pendingCashEvents", () => {
  const base = { currency: "CLP" as const, estimated: false };
  const events: CalendarEvent[] = [
    {
      ...base,
      id: "a",
      date: "2026-10-10",
      kind: "expense",
      label: "Ayer",
      amountMinor: -1n,
    },
    {
      ...base,
      id: "b",
      date: "2026-10-15",
      kind: "expense",
      label: "Hoy recurrente",
      amountMinor: -2n,
    },
    {
      ...base,
      id: "c",
      date: "2026-10-15",
      kind: "card_billing",
      label: "Hoy tarjeta",
      amountMinor: -3n,
    },
    {
      ...base,
      id: "d",
      date: "2026-10-20",
      kind: "card_close",
      label: "Cierre",
      amountMinor: null,
    },
    {
      ...base,
      id: "e",
      date: "2026-10-20",
      kind: "income",
      label: "Sueldo",
      amountMinor: 9n,
    },
  ];

  it("deja lo posterior a hoy y los vencimientos de tarjeta/prestamo de hoy; sin monto no hay flujo", () => {
    const result = pendingCashEvents(events, "2026-10-15", (e) => e.amountMinor);
    expect(result.map((e) => e.id)).toEqual(["c", "e"]);
  });

  it("descarta lo que no se pudo convertir", () => {
    expect(pendingCashEvents(events, "2026-10-15", () => null)).toEqual([]);
  });
});

describe("pendingCashEvents · depositos a plazo", () => {
  it("el vencimiento de un deposito no cuenta como plata liquida", () => {
    const result = pendingCashEvents(
      [
        {
          id: "m",
          date: "2026-11-01",
          kind: "deposit_maturity",
          label: "Vence DAP",
          amountMinor: 1_000_000n,
          currency: "CLP",
          estimated: false,
        },
        {
          id: "e",
          date: "2026-11-02",
          kind: "expense",
          label: "Arriendo",
          amountMinor: -500_000n,
          currency: "CLP",
          estimated: false,
        },
      ],
      "2026-10-15",
      (e) => e.amountMinor,
    );
    expect(result.map((e) => e.id)).toEqual(["e"]);
  });
});

describe("capCardBillings", () => {
  const bill = (id: string, date: string, amount: bigint): CashEvent => ({
    id,
    date,
    kind: "card_billing",
    amountMinor: -amount,
  });

  it("recorta las facturaciones al total que se debe hoy (un pago adelantado no se descuenta dos veces)", () => {
    const events = [
      bill("bill:cmr:2026-11-05", "2026-11-05", 100000n),
      bill("bill:cmr:2026-12-05", "2026-12-05", 100000n),
      bill("bill:cmr:2027-01-05", "2027-01-05", 100000n),
    ];
    const capped = capCardBillings(events, new Map([["cmr", 150000n]]));
    expect(capped.map((e) => e.amountMinor)).toEqual([-100000n, -50000n]);
  });

  it("deuda cero: no queda nada por facturar", () => {
    expect(
      capCardBillings(
        [bill("bill:cmr:2026-11-05", "2026-11-05", 100000n)],
        new Map([["cmr", 0n]]),
      ),
    ).toEqual([]);
  });

  it("no toca otros eventos ni tarjetas sin dato de deuda", () => {
    const loan: CashEvent = {
      id: "loan:x:1",
      date: "2026-11-10",
      kind: "loan",
      amountMinor: -5n,
    };
    const other = bill("bill:otra:2026-11-05", "2026-11-05", 70000n);
    expect(capCardBillings([loan, other], new Map())).toEqual(
      [other, loan].sort((a, b) => (a.date < b.date ? -1 : 1)),
    );
  });

  it("cada tarjeta lleva su propio tope", () => {
    const events = [
      bill("bill:a:2026-11-05", "2026-11-05", 80000n),
      bill("bill:b:2026-11-06", "2026-11-06", 80000n),
    ];
    const capped = capCardBillings(
      events,
      new Map([
        ["a", 50000n],
        ["b", 100000n],
      ]),
    );
    expect(capped.map((e) => e.amountMinor)).toEqual([-50000n, -80000n]);
  });
});

describe("projectCashFlow", () => {
  const ev = (
    date: string,
    amountMinor: bigint,
    kind: CashEvent["kind"] = "expense",
  ): CashEvent => ({
    id: `${kind}:${date}`,
    date,
    kind,
    amountMinor,
  });

  it("agrupa por mes: el primero es solo lo que falta del mes en curso", () => {
    const p = projectCashFlow({
      today: "2026-10-28",
      monthsAhead: 2,
      startingBalanceMinor: 1000000n,
      events: [ev("2026-10-30", -100000n), ev("2026-11-05", 500000n, "income")],
      variableMonthlyMinor: 0n,
    });
    expect(p.months.map((m) => m.monthKey)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(p.months[0]).toMatchObject({
      committedMinor: 100000n,
      endBalanceMinor: 900000n,
    });
    expect(p.months[1]).toMatchObject({
      incomeMinor: 500000n,
      endBalanceMinor: 1400000n,
    });
    expect(p.firstShortfall).toBeNull();
  });

  it("el gasto variable se reparte por dia y suma exacto en cada mes completo", () => {
    const p = projectCashFlow({
      today: "2026-10-31",
      monthsAhead: 1,
      startingBalanceMinor: 1000000n,
      events: [],
      variableMonthlyMinor: 300001n, // no divisible por 30
    });
    expect(p.months).toHaveLength(1);
    expect(p.months[0].monthKey).toBe("2026-11");
    expect(p.months[0].variableMinor).toBe(300001n);
    expect(p.months[0].endBalanceMinor).toBe(1000000n - 300001n);
  });

  it("marca el mes y el dia en que el saldo baja de cero, aunque se recupere al cierre", () => {
    const p = projectCashFlow({
      today: "2026-10-31",
      monthsAhead: 1,
      startingBalanceMinor: 100000n,
      // El arriendo vence el 5 y el sueldo llega el 28: en el medio queda en negativo.
      events: [ev("2026-11-05", -420000n), ev("2026-11-28", 1800000n, "income")],
      variableMonthlyMinor: 0n,
    });
    expect(p.months[0].short).toBe(true);
    expect(p.months[0].lowestBalanceMinor).toBe(-320000n);
    expect(p.months[0].lowestOn).toBe("2026-11-05");
    expect(p.months[0].endBalanceMinor).toBe(1480000n);
    expect(p.firstShortfall).toEqual({
      date: "2026-11-05",
      monthKey: "2026-11",
      balanceMinor: -320000n,
    });
  });

  it("ignora eventos de hoy hacia atras y los posteriores al horizonte", () => {
    const p = projectCashFlow({
      today: "2026-10-15",
      monthsAhead: 1,
      startingBalanceMinor: 1000n,
      events: [ev("2026-10-15", -999n), ev("2026-10-01", -999n), ev("2027-03-01", -999n)],
      variableMonthlyMinor: 0n,
    });
    expect(p.months.every((m) => m.committedMinor === 0n)).toBe(true);
  });

  it("neto = ingresos - comprometido - variable", () => {
    const p = projectCashFlow({
      today: "2026-10-31",
      monthsAhead: 1,
      startingBalanceMinor: 0n,
      events: [ev("2026-11-10", 1000000n, "income"), ev("2026-11-12", -400000n)],
      variableMonthlyMinor: 300000n,
    });
    expect(p.months[0].netMinor).toBe(300000n);
    expect(p.months[0].endBalanceMinor).toBe(300000n);
  });

  it("cubre el cruce de anio", () => {
    const p = projectCashFlow({
      today: "2026-11-20",
      monthsAhead: 3,
      startingBalanceMinor: 0n,
      events: [],
      variableMonthlyMinor: 0n,
    });
    expect(p.months.map((m) => m.monthKey)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("escenarios de la proyeccion", () => {
  it("escala el gasto variable en enteros", () => {
    expect(scaleVariable(500_000n, 0)).toBe(500_000n);
    expect(scaleVariable(500_000n, 10)).toBe(550_000n);
    expect(scaleVariable(500_000n, -20)).toBe(400_000n);
    expect(scaleVariable(333n, 10)).toBe(366n); // trunca, no inventa decimales
    expect(scaleVariable(0n, 20)).toBe(0n);
  });

  it("solo acepta los escenarios de la lista", () => {
    expect(parseScenario("10")).toBe(10);
    expect(parseScenario("-20")).toBe(-20);
    expect(parseScenario(undefined)).toBe(0);
    expect(parseScenario("35")).toBe(0);
    expect(parseScenario("abc")).toBe(0);
  });

  it("gastar mas en lo variable baja el saldo al cierre", () => {
    const base = {
      today: "2026-10-03",
      monthsAhead: 2,
      startingBalanceMinor: 1_000_000n,
      events: [] as CashEvent[],
    };
    const normal = projectCashFlow({ ...base, variableMonthlyMinor: 600_000n });
    const more = projectCashFlow({
      ...base,
      variableMonthlyMinor: scaleVariable(600_000n, 20),
    });
    const last = (p: typeof normal) => p.months[p.months.length - 1].endBalanceMinor;
    expect(last(more)).toBeLessThan(last(normal));
  });
});
