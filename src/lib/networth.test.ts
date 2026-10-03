import { describe, expect, it } from "vitest";
import { RateBook, parseRate } from "./fx";
import { priceLookupFor } from "./holding-value";
import { amortizationSchedule, outstandingAt } from "./loans";
import {
  earliestActivity,
  loanStartDate,
  netWorthSeries,
  seriesDates,
  type NwHolding,
  type NwLoan,
} from "./networth";

describe("seriesDates", () => {
  it("cierre de cada mes completo desde el inicio, y hoy al final", () => {
    expect(seriesDates("2026-08-05", "2026-10-15")).toEqual([
      "2026-08-31",
      "2026-09-30",
      "2026-10-15",
    ]);
  });

  it("si todo el historial es de este mes, solo queda hoy", () => {
    expect(seriesDates("2026-10-03", "2026-10-15")).toEqual(["2026-10-15"]);
  });

  it("limita a los ultimos N meses", () => {
    const dates = seriesDates("2020-01-10", "2026-10-15", 6);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-04-30");
    expect(dates.at(-1)).toBe("2026-10-15");
  });

  it("respeta febrero y los anios bisiestos", () => {
    expect(seriesDates("2028-02-10", "2028-04-15")).toEqual([
      "2028-02-29",
      "2028-03-31",
      "2028-04-15",
    ]);
  });
});

describe("outstandingAt (prestamos)", () => {
  const { rows } = amortizationSchedule({
    principalMinor: 600000n,
    installmentMinor: 100000n,
    count: 6,
    firstDueDate: "2026-10-10",
  })!;

  it("el capital baja con cada cuota vencida; la que vence ese dia sigue pendiente", () => {
    expect(outstandingAt(600000n, rows, "2026-10-10")).toBe(600000n);
    expect(outstandingAt(600000n, rows, "2026-10-11")).toBe(500000n);
    expect(outstandingAt(600000n, rows, "2027-04-11")).toBe(0n);
  });
});

describe("netWorthSeries", () => {
  const book = new RateBook([]);
  const accounts = [
    {
      id: "cta",
      type: "checking" as const,
      currency: "CLP" as const,
      initialMinor: 1000000n,
    },
    {
      id: "tarjeta",
      type: "credit_card" as const,
      currency: "CLP" as const,
      initialMinor: 0n,
    },
  ];
  const transactions = [
    { accountId: "cta", date: "2026-08-10", amountMinor: 500000n },
    { accountId: "tarjeta", date: "2026-09-05", amountMinor: -200000n },
  ];
  const holdings: NwHolding[] = [
    {
      id: "dap",
      currency: "CLP",
      spec: { method: "manual", currency: "CLP" },
      priceAt: null,
      flows: [{ occurredOn: "2026-08-20", amountMinor: 300000n }],
      valuations: [{ valuedOn: "2026-09-30", valueMinor: 330000n }],
    },
  ];
  const { rows } = amortizationSchedule({
    principalMinor: 600000n,
    installmentMinor: 100000n,
    count: 6,
    firstDueDate: "2026-10-10",
  })!;
  const loans: NwLoan[] = [
    {
      id: "auto",
      currency: "CLP",
      principalMinor: 600000n,
      firstDueDate: "2026-10-10",
      rows,
    },
  ];

  const points = netWorthSeries({
    dates: ["2026-08-31", "2026-09-30", "2026-10-15"],
    display: "CLP",
    book,
    accounts,
    transactions,
    holdings,
    loans,
  });

  it("agosto: cuenta + instrumento a costo; el prestamo todavia no existe", () => {
    expect(points[0]).toMatchObject({
      date: "2026-08-31",
      assetsMinor: 1500000n + 300000n,
      liabilitiesMinor: 0n,
      netWorthMinor: 1800000n,
    });
  });

  it("septiembre: la tarjeta y el prestamo son pasivos; el instrumento ya esta valorizado", () => {
    expect(points[1]).toMatchObject({
      assetsMinor: 1500000n + 330000n,
      liabilitiesMinor: -200000n - 600000n,
      netWorthMinor: 1030000n,
    });
  });

  it("octubre: la primera cuota vencida baja el capital pendiente del prestamo", () => {
    expect(points[2]).toMatchObject({
      assetsMinor: 1830000n,
      liabilitiesMinor: -200000n - 500000n,
      netWorthMinor: 1130000n,
    });
    expect(points.every((p) => p.unconverted === 0)).toBe(true);
  });

  it("convierte cada punto con la cotizacion de SU fecha", () => {
    const usdBook = new RateBook([
      { date: "2026-08-01", currency: "USD", rate: parseRate("900")! },
      { date: "2026-10-01", currency: "USD", rate: parseRate("1000")! },
    ]);
    const result = netWorthSeries({
      dates: ["2026-08-31", "2026-10-15"],
      display: "CLP",
      book: usdBook,
      accounts: [
        { id: "usd", type: "savings", currency: "USD", initialMinor: 10000n }, // US$100
      ],
      transactions: [],
      holdings: [],
      loans: [],
    });
    expect(result[0].netWorthMinor).toBe(90000n);
    expect(result[1].netWorthMinor).toBe(100000n);
  });

  it("una cuenta sin cotizacion se cuenta como no convertida en vez de sumarse mal", () => {
    const result = netWorthSeries({
      dates: ["2026-10-15"],
      display: "CLP",
      book,
      accounts: [{ id: "usd", type: "savings", currency: "USD", initialMinor: 10000n }],
      transactions: [],
      holdings: [],
      loans: [],
    });
    expect(result[0].unconverted).toBe(1);
    expect(result[0].netWorthMinor).toBe(0n);
  });
});

describe("earliestActivity / loanStartDate", () => {
  it("toma la fecha mas antigua entre movimientos, instrumentos y prestamos", () => {
    const { rows } = amortizationSchedule({
      principalMinor: 600000n,
      installmentMinor: 100000n,
      count: 6,
      firstDueDate: "2026-03-10",
    })!;
    expect(
      earliestActivity({
        transactions: [{ accountId: "a", date: "2026-05-01", amountMinor: 1n }],
        holdings: [
          {
            id: "h",
            currency: "CLP",
            spec: { method: "manual", currency: "CLP" },
            priceAt: null,
            flows: [{ occurredOn: "2026-04-02", amountMinor: 1n }],
            valuations: [],
          },
        ],
        loans: [
          {
            id: "l",
            currency: "CLP",
            principalMinor: 600000n,
            firstDueDate: "2026-03-10",
            rows,
          },
        ],
      }),
    ).toBe("2026-02-10");
    expect(earliestActivity({ transactions: [], holdings: [], loans: [] })).toBeNull();
  });

  it("el prestamo se asume otorgado un mes antes de la primera cuota", () => {
    expect(loanStartDate("2026-10-10")).toBe("2026-09-10");
    expect(loanStartDate("2026-03-31")).toBe("2026-02-28");
  });
});

describe("instrumentos que se valorizan solos", () => {
  it("el patrimonio usa la cotizacion de cada fecha, no la de hoy", () => {
    const rates = [
      { date: "2026-08-15", currency: "USD" as const, rate: parseRate(900)! },
      { date: "2026-09-15", currency: "USD" as const, rate: parseRate(1000)! },
    ];
    const book = new RateBook(rates);
    const rateAt = (code: string, date: string) => {
      const found = book.latest(code as "USD", date);
      return found ? { price: found.rate, date: found.date } : null;
    };
    const usd: NwHolding = {
      id: "usd",
      currency: "CLP",
      spec: { method: "fx", currency: "CLP" },
      flows: [{ occurredOn: "2026-08-20", amountMinor: 900_000n, units: 1000_00000000n }],
      valuations: [],
      priceAt: priceLookupFor("fx", "USD", [], rateAt),
    };
    const series = netWorthSeries({
      dates: ["2026-08-31", "2026-09-30"],
      display: "CLP",
      book,
      accounts: [],
      transactions: [],
      holdings: [usd],
      loans: [],
    });
    // 1.000 USD x 900 en agosto y x 1.000 en septiembre.
    expect(series.map((p) => p.netWorthMinor)).toEqual([900_000n, 1_000_000n]);
  });
});
