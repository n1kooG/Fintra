import { describe, expect, it } from "vitest";
import {
  RATE_SCALE,
  RateBook,
  convertAtDate,
  convertMinor,
  divRound,
  formatRate,
  parseRate,
} from "./fx";

const r = (value: string) => parseRate(value)!;

describe("parseRate / formatRate", () => {
  it("parsea strings de numeric y numbers de la API", () => {
    expect(parseRate("959.39")).toBe(959_390_000n);
    expect(parseRate(41008.1)).toBe(41_008_100_000n);
    expect(parseRate("71721")).toBe(71_721_000_000n);
    expect(parseRate("959.390000")).toBe(959_390_000n);
  });

  it("rechaza vacios, negativos, cero y basura", () => {
    expect(parseRate(null)).toBeNull();
    expect(parseRate("0")).toBeNull();
    expect(parseRate("-5")).toBeNull();
    expect(parseRate("abc")).toBeNull();
  });

  it("formatea de vuelta con 6 decimales para numeric(18,6)", () => {
    expect(formatRate(959_390_000n)).toBe("959.390000");
    expect(formatRate(RATE_SCALE)).toBe("1.000000");
  });
});

describe("divRound", () => {
  it("redondea la mitad hacia afuera del cero, simetrico", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(-7n, 2n)).toBe(-4n);
  });
});

describe("convertMinor", () => {
  const usd = r("959.39");
  const uf = r("41008.10");

  it("USD a CLP redondea al peso", () => {
    // US$10,50 * 959,39 = 10.073,595 -> 10.074
    expect(convertMinor(1050n, "USD", "CLP", usd, null)).toBe(10074n);
  });

  it("CLP a USD redondea al centavo", () => {
    // 100.000 / 959,39 = 104,2328 -> US$104,23
    expect(convertMinor(100000n, "CLP", "USD", null, usd)).toBe(10423n);
  });

  it("UF a CLP", () => {
    expect(convertMinor(100n, "UF", "CLP", uf, null)).toBe(41008n);
  });

  it("USD a UF va directo, sin perder precision en pesos intermedios", () => {
    // 100 * 959,39 / 41.008,10 = 2,3395 -> UF 2,34
    expect(convertMinor(10000n, "USD", "UF", usd, uf)).toBe(234n);
  });

  it("respeta el signo (gastos negativos)", () => {
    expect(convertMinor(-1050n, "USD", "CLP", usd, null)).toBe(-10074n);
  });

  it("misma moneda no toca el monto", () => {
    expect(convertMinor(1234n, "USD", "USD", null, null)).toBe(1234n);
  });

  it("falla fuerte si falta una cotizacion, en vez de inventar un numero", () => {
    expect(() => convertMinor(1050n, "USD", "CLP", null, null)).toThrow();
  });
});

describe("RateBook", () => {
  const book = new RateBook([
    { date: "2026-09-21", currency: "USD", rate: r("960") },
    { date: "2026-09-18", currency: "USD", rate: r("950") },
    { date: "2026-09-01", currency: "UTM", rate: r("71721") },
  ]);

  it("usa la ultima cotizacion publicada en o antes de la fecha (fin de semana)", () => {
    expect(book.rateOn("USD", "2026-09-20")).toBe(r("950"));
    expect(book.rateOn("USD", "2026-09-21")).toBe(r("960"));
    expect(book.rateOn("USD", "2026-09-30")).toBe(r("960"));
  });

  it("devuelve null antes de la primera cotizacion conocida", () => {
    expect(book.rateOn("USD", "2026-09-17")).toBeNull();
    expect(book.rateOn("UF", "2026-09-20")).toBeNull();
  });

  it("la UTM mensual vale todo el mes", () => {
    expect(book.rateOn("UTM", "2026-09-29")).toBe(r("71721"));
  });

  it("CLP siempre vale 1", () => {
    expect(book.rateOn("CLP", "2000-01-01")).toBe(RATE_SCALE);
  });

  it("latest informa la fecha de la cotizacion usada", () => {
    expect(book.latest("USD", "2026-09-20")).toEqual({
      date: "2026-09-18",
      rate: r("950"),
    });
  });
});

describe("convertAtDate", () => {
  const book = new RateBook([
    { date: "2026-03-02", currency: "USD", rate: r("900") },
    { date: "2026-09-21", currency: "USD", rate: r("960") },
  ]);

  it("prefiere la cotizacion congelada en el movimiento", () => {
    const value = convertAtDate(
      {
        amountMinor: -1000n,
        currency: "USD",
        occurredOn: "2026-09-21",
        frozenRate: r("1000"),
      },
      "CLP",
      book,
    );
    expect(value).toBe(-10000n);
  });

  it("sin cotizacion congelada usa la de SU fecha, no la de hoy", () => {
    const value = convertAtDate(
      {
        amountMinor: -1000n,
        currency: "USD",
        occurredOn: "2026-03-10",
        frozenRate: null,
      },
      "CLP",
      book,
    );
    expect(value).toBe(-9000n);
  });

  it("convierte CLP a la moneda de visualizacion con la cotizacion de la fecha", () => {
    const value = convertAtDate(
      {
        amountMinor: 96000n,
        currency: "CLP",
        occurredOn: "2026-09-22",
        frozenRate: null,
      },
      "USD",
      book,
    );
    expect(value).toBe(10000n);
  });

  it("devuelve null si no hay cotizacion para esa fecha", () => {
    const value = convertAtDate(
      {
        amountMinor: -1000n,
        currency: "USD",
        occurredOn: "2025-01-01",
        frozenRate: null,
      },
      "CLP",
      book,
    );
    expect(value).toBeNull();
  });
});
