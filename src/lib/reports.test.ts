import { describe, expect, it } from "vitest";
import { RateBook, parseRate } from "./fx";
import {
  breakdownByCategory,
  consolidateBalances,
  summarize,
  type ReportTransaction,
} from "./reports";

const book = new RateBook([
  { date: "2026-03-02", currency: "USD", rate: parseRate("900")! },
  { date: "2026-09-21", currency: "USD", rate: parseRate("1000")! },
  { date: "2026-09-24", currency: "UF", rate: parseRate("40000")! },
]);

const super_ = { id: "super", name: "Supermercado" };
const subs = { id: "subs", name: "Suscripciones" };

const txs: ReportTransaction[] = [
  {
    type: "income",
    amount_minor: "1000000",
    currency: "CLP",
    fx_rate: null,
    occurred_on: "2026-09-01",
  },
  {
    type: "expense",
    amount_minor: "-50000",
    currency: "CLP",
    fx_rate: null,
    occurred_on: "2026-09-22",
    category_id: "super",
    category: super_,
  },
  // US$10 congelado a 950: vale 9.500, no 10.000 (la de hoy)
  {
    type: "expense",
    amount_minor: "-1000",
    currency: "USD",
    fx_rate: "950.000000",
    occurred_on: "2026-09-22",
    category_id: "subs",
    category: subs,
  },
  // US$10 sin congelar en marzo: usa la de marzo (900)
  {
    type: "expense",
    amount_minor: "-1000",
    currency: "USD",
    fx_rate: null,
    occurred_on: "2026-03-10",
    category_id: "subs",
    category: subs,
  },
  // Transferencias no son ingreso ni gasto
  {
    type: "transfer",
    amount_minor: "-200000",
    currency: "CLP",
    fx_rate: null,
    occurred_on: "2026-09-10",
  },
  // Sin cotizacion posible (antes del primer dolar conocido)
  {
    type: "expense",
    amount_minor: "-1000",
    currency: "USD",
    fx_rate: null,
    occurred_on: "2025-01-01",
    category_id: "subs",
    category: subs,
  },
];

describe("summarize", () => {
  it("consolida en CLP con la cotizacion de cada fecha, sin transferencias", () => {
    const s = summarize(txs, "CLP", book);
    expect(s.incomeMinor).toBe(1000000n);
    expect(s.expenseMinor).toBe(-(50000n + 9500n + 9000n));
    expect(s.balanceMinor).toBe(1000000n - 68500n);
    expect(s.expenseCount).toBe(3);
  });

  it("cuenta lo que no pudo convertir en vez de sumarlo mal", () => {
    expect(summarize(txs, "CLP", book).unconverted).toBe(1);
  });

  it("consolida en USD (CLP a dolar con la cotizacion del dia de cada movimiento)", () => {
    const s = summarize(txs.slice(0, 2), "USD", book);
    // 1.000.000 CLP el 01-09 a 900 = US$1.111,11 ; 50.000 el 22-09 a 1000 = US$50
    expect(s.incomeMinor).toBe(111111n);
    expect(s.expenseMinor).toBe(-5000n);
  });
});

describe("redondeo unico al consolidar", () => {
  it("suma con precision extra y redondea una sola vez al final", () => {
    const ufBook = new RateBook([
      { date: "2026-09-01", currency: "UF", rate: parseRate("41000")! },
    ]);
    // Cada $205 son 0,005 UF: redondeando cada uno daria 0,01 x 3 = 0,03 UF.
    // La suma exacta es $615 = 0,015 UF -> 0,02 UF.
    const small: ReportTransaction[] = Array.from({ length: 3 }, () => ({
      type: "expense" as const,
      amount_minor: "-205",
      currency: "CLP" as const,
      fx_rate: null,
      occurred_on: "2026-09-10",
    }));
    expect(summarize(small, "UF", ufBook).expenseMinor).toBe(-2n);
  });
});

describe("breakdownByCategory", () => {
  it("agrupa gastos por categoria de mayor a menor, en positivo", () => {
    const { rows, unconverted } = breakdownByCategory(txs, "CLP", book);
    expect(rows).toEqual([
      { categoryId: "super", name: "Supermercado", totalMinor: 50000n },
      { categoryId: "subs", name: "Suscripciones", totalMinor: 18500n },
    ]);
    expect(unconverted).toBe(1);
  });
});

describe("consolidateBalances", () => {
  it("separa activos y pasivos a la cotizacion de hoy", () => {
    const nw = consolidateBalances(
      [
        { id: "rut", type: "checking", currency: "CLP", balanceMinor: 500000n },
        { id: "usd", type: "savings", currency: "USD", balanceMinor: 10000n }, // US$100
        { id: "visa", type: "credit_card", currency: "CLP", balanceMinor: -120000n },
        { id: "uf", type: "investment", currency: "UF", balanceMinor: 150n }, // UF 1,50
      ],
      "CLP",
      book,
      "2026-09-24",
    );
    expect(nw.assetsMinor).toBe(500000n + 100000n + 60000n);
    expect(nw.liabilitiesMinor).toBe(-120000n);
    expect(nw.netWorthMinor).toBe(540000n);
    expect(nw.convertedById.get("usd")).toBe(100000n);
    expect(nw.unconverted).toBe(0);
  });

  it("una cuenta sin cotizacion queda fuera y se informa", () => {
    const nw = consolidateBalances(
      [{ id: "utm", type: "savings", currency: "UTM", balanceMinor: 2n }],
      "CLP",
      book,
      "2026-09-24",
    );
    expect(nw.unconverted).toBe(1);
    expect(nw.convertedById.get("utm")).toBeNull();
    expect(nw.assetsMinor).toBe(0n);
  });
});
