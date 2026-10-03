import { describe, expect, it } from "vitest";
import {
  annualizePercent,
  changePercent,
  fixedTermInterestMinor,
  formatScaled,
  formatUnits,
  holdingMetrics,
  holdingValueAt,
  parsePrice,
  parseScaled,
  parseUnits,
  periodReturnPercent,
  priceLookupFor,
  priceLookupFromValuations,
  realReturnPercent,
  unitsHeldAt,
  unitsToDb,
  unitsValueMinor,
  type FixedTermTerms,
  type HoldingSpec,
} from "./holding-value";

const u = (n: number) => parseUnits(n)!;
const p = (n: number) => parsePrice(n)!;

describe("decimales escalados", () => {
  it("parsea y formatea sin perder precision", () => {
    expect(parseScaled("0.002", 8)).toBe(200_000n);
    expect(parseScaled("-1.5", 8)).toBe(-150_000_000n);
    expect(parseScaled("12", 6)).toBe(12_000_000n);
    expect(parseScaled(959.39, 6)).toBe(959_390_000n);
    expect(formatScaled(200_000n, 8)).toBe("0.00200000");
    expect(unitsToDb(u(1500.25))).toBe("1500.25000000");
    expect(formatScaled(-150_000_000n, 8)).toBe("-1.50000000");
  });

  it("recorta decimales de mas y rechaza basura", () => {
    expect(parseScaled("0.123456789", 8)).toBe(12_345_678n);
    expect(parseScaled("abc", 8)).toBeNull();
    expect(parseScaled("", 8)).toBeNull();
    expect(parseScaled(null, 8)).toBeNull();
    expect(parseScaled("1,5", 8)).toBeNull();
  });

  it("formatUnits usa formato chileno y sin ceros de relleno", () => {
    expect(formatUnits(u(1500))).toBe("1.500");
    expect(formatUnits(u(0.002))).toBe("0,002");
    expect(formatUnits(u(1234567.25))).toBe("1.234.567,25");
    expect(formatUnits(-u(2.5))).toBe("-2,5");
    expect(formatUnits(u(0.123456789), 4)).toBe("0,1234");
  });
});

describe("unidades x precio", () => {
  it("1.500 USD a $959,39 = $1.439.085 en pesos", () => {
    expect(unitsValueMinor(u(1500), p(959.39), "CLP")).toBe(1_439_085n);
  });

  it("respeta los decimales de la moneda del instrumento (USD en centavos)", () => {
    // 0,5 BTC a US$60.000,50 = US$30.000,25 -> 3.000.025 centavos
    expect(unitsValueMinor(u(0.5), p(60_000.5), "USD")).toBe(3_000_025n);
  });

  it("redondea una sola vez, al final", () => {
    // 3 unidades a $0,5 = $1,5 -> $2 (mitad hacia afuera)
    expect(unitsValueMinor(u(3), p(0.5), "CLP")).toBe(2n);
    expect(unitsValueMinor(u(0.00000001), p(1_000_000), "CLP")).toBe(0n);
  });

  it("cuenta las unidades hasta una fecha, con compras y ventas", () => {
    const flows = [
      { occurredOn: "2026-01-10", amountMinor: 100n, units: u(2) },
      { occurredOn: "2026-03-01", amountMinor: -50n, units: u(-0.5) },
      { occurredOn: "2026-06-01", amountMinor: 80n, units: u(1) },
    ];
    expect(unitsHeldAt(flows, "2026-02-01")).toBe(u(2));
    expect(unitsHeldAt(flows, "2026-04-01")).toBe(u(1.5));
    expect(unitsHeldAt(flows, "2026-12-01")).toBe(u(2.5));
    expect(unitsHeldAt(flows, "2025-12-31")).toBe(0n);
  });
});

describe("buscador de precios", () => {
  const points = [
    { valuedOn: "2026-03-01", valueMinor: 0n, unitPrice: p(100) },
    { valuedOn: "2026-06-01", valueMinor: 0n, unitPrice: p(120) },
    { valuedOn: "2026-04-01", valueMinor: 999n }, // total escrito a mano: no es un precio
  ];

  it("usa el ultimo precio en o antes de la fecha", () => {
    const lookup = priceLookupFromValuations(points);
    expect(lookup("2026-02-01")).toBeNull();
    expect(lookup("2026-03-01")).toEqual({ price: p(100), date: "2026-03-01" });
    expect(lookup("2026-05-15")).toEqual({ price: p(100), date: "2026-03-01" });
    expect(lookup("2026-07-01")).toEqual({ price: p(120), date: "2026-06-01" });
  });

  it("fx usa la cotizacion; crypto y priced, los puntos guardados; el resto, nada", () => {
    const rateAt = () => ({ price: p(959), date: "2026-09-30" });
    expect(priceLookupFor("fx", "USD", [], rateAt)!("2026-10-01")).toEqual({
      price: p(959),
      date: "2026-09-30",
    });
    expect(priceLookupFor("fx", null, [], rateAt)).toBeNull();
    expect(priceLookupFor("crypto", "BTC", points, rateAt)!("2026-07-01")?.price).toBe(
      p(120),
    );
    expect(priceLookupFor("priced", null, points, rateAt)).not.toBeNull();
    expect(priceLookupFor("manual", null, points, rateAt)).toBeNull();
    expect(priceLookupFor("fixed_term", null, points, rateAt)).toBeNull();
  });
});

describe("instrumento por unidades (dolares)", () => {
  const spec: HoldingSpec = { method: "fx", currency: "CLP" };
  const flows = [{ occurredOn: "2026-01-10", amountMinor: 1_400_000n, units: u(1500) }];
  const rateAt = (_code: string, date: string) =>
    date >= "2026-09-01"
      ? { price: p(960), date: "2026-09-01" }
      : { price: p(933.33), date: "2026-01-10" };
  const lookup = priceLookupFor("fx", "USD", [], rateAt)!;

  it("vale las unidades por la cotizacion de la fecha", () => {
    expect(holdingValueAt(spec, flows, [], lookup, "2026-02-01").valueMinor).toBe(
      1_399_995n,
    );
    expect(holdingValueAt(spec, flows, [], lookup, "2026-10-01")).toEqual({
      valueMinor: 1_440_000n,
      valued: true,
      valuedOn: "2026-09-01",
    });
  });

  it("la ganancia incluye el efecto del tipo de cambio", () => {
    const m = holdingMetrics(spec, flows, [], lookup, "2026-10-01");
    expect(m.investedMinor).toBe(1_400_000n);
    expect(m.gainMinor).toBe(40_000n);
    expect(m.returnPercent).toBeCloseTo(2.85, 2);
    expect(m.unitsHeld).toBe(u(1500));
    expect(m.unitPrice).toBe(p(960));
  });

  it("sin cotizacion disponible cae al costo", () => {
    const v = holdingValueAt(spec, flows, [], () => null, "2026-10-01");
    expect(v).toEqual({ valueMinor: 1_400_000n, valued: false, valuedOn: null });
  });

  it("vender todo deja el valor en cero", () => {
    const sold = [
      ...flows,
      { occurredOn: "2026-05-01", amountMinor: -1_450_000n, units: u(-1500) },
    ];
    expect(holdingValueAt(spec, sold, [], lookup, "2026-10-01").valueMinor).toBe(0n);
  });

  it("flujos sin unidades registradas (datos antiguos) se valoran a costo", () => {
    const legacy = [{ occurredOn: "2026-01-10", amountMinor: 500_000n }];
    expect(holdingValueAt(spec, legacy, [], lookup, "2026-10-01").valued).toBe(false);
  });
});

describe("deposito a plazo", () => {
  const monthly: FixedTermTerms = {
    start: "2026-09-01",
    end: "2026-12-01", // 91 dias
    ratePercentScaled: 4500n, // 0,45 % mensual
    period: "monthly",
  };
  const annual: FixedTermTerms = {
    start: "2026-01-01",
    end: "2027-01-01",
    ratePercentScaled: 60_000n, // 6 % anual
    period: "annual",
  };
  const spec = (terms: FixedTermTerms): HoldingSpec => ({
    method: "fixed_term",
    currency: "CLP",
    terms,
  });
  const deposit = (date: string) => [{ occurredOn: date, amountMinor: 1_000_000n }];

  it("interes simple: tasa mensual sobre 30 dias", () => {
    expect(fixedTermInterestMinor(1_000_000n, monthly, "2026-10-01")).toBe(4_500n); // 30 dias
    expect(fixedTermInterestMinor(1_000_000n, monthly, "2026-09-16")).toBe(2_250n); // 15 dias
  });

  it("el interes se detiene al vencer", () => {
    // 91 dias: 1.000.000 x 0,0045 x 91/30 = 13.650
    expect(fixedTermInterestMinor(1_000_000n, monthly, "2026-12-01")).toBe(13_650n);
    expect(fixedTermInterestMinor(1_000_000n, monthly, "2027-06-01")).toBe(13_650n);
  });

  it("tasa anual sobre base 365", () => {
    expect(fixedTermInterestMinor(1_000_000n, annual, "2027-01-01")).toBe(60_000n);
  });

  it("antes de empezar no hay interes", () => {
    expect(fixedTermInterestMinor(1_000_000n, monthly, "2026-08-01")).toBe(0n);
  });

  it("el valor es capital + interes devengado hasta hoy", () => {
    const v = holdingValueAt(
      spec(monthly),
      deposit("2026-09-01"),
      [],
      null,
      "2026-10-01",
    );
    expect(v).toEqual({ valueMinor: 1_004_500n, valued: true, valuedOn: "2026-10-01" });
  });

  it("al vencer fija capital + interes total y sigue ahi", () => {
    const v = holdingValueAt(
      spec(monthly),
      deposit("2026-09-01"),
      [],
      null,
      "2027-02-01",
    );
    expect(v.valueMinor).toBe(1_013_650n);
    expect(v.valuedOn).toBe("2026-12-01");
  });

  it("al cobrarlo completo el valor queda en cero y la ganancia es el interes", () => {
    const flows = [
      ...deposit("2026-09-01"),
      { occurredOn: "2026-12-01", amountMinor: -1_013_650n },
    ];
    const m = holdingMetrics(spec(monthly), flows, [], null, "2026-12-05");
    expect(m.valueMinor).toBe(0n);
    expect(m.gainMinor).toBe(13_650n);
    expect(m.returnPercent).toBeCloseTo(1.36, 2);
  });
});

describe("rentabilidad del periodo (Dietz modificado)", () => {
  const spec: HoldingSpec = { method: "manual", currency: "CLP" };
  const flows = [{ occurredOn: "2026-01-01", amountMinor: 1_000_000n }];

  it("sin aportes en el periodo es la variacion del valor", () => {
    const valuations = [
      { valuedOn: "2026-02-01", valueMinor: 1_000_000n },
      { valuedOn: "2026-03-01", valueMinor: 1_020_000n },
    ];
    expect(
      periodReturnPercent(spec, flows, valuations, null, "2026-02-01", "2026-03-01"),
    ).toBe(2);
  });

  it("un aporte a mitad de periodo no cuenta como ganancia", () => {
    const valuations = [
      { valuedOn: "2026-02-01", valueMinor: 1_000_000n },
      { valuedOn: "2026-03-01", valueMinor: 1_520_000n },
    ];
    const withDeposit = [...flows, { occurredOn: "2026-02-15", amountMinor: 500_000n }];
    const r = periodReturnPercent(
      spec,
      withDeposit,
      valuations,
      null,
      "2026-02-01",
      "2026-03-01",
    )!;
    // ganancia 20.000 sobre ~1.000.000 + 500.000 x (14/28)  ->  entre 1,5 % y 2 %
    expect(r).toBeGreaterThan(1.5);
    expect(r).toBeLessThan(2);
  });

  it("sin base de capital o periodo invalido: null", () => {
    expect(
      periodReturnPercent(spec, [], [], null, "2026-02-01", "2026-03-01"),
    ).toBeNull();
    expect(
      periodReturnPercent(spec, flows, [], null, "2026-03-01", "2026-03-01"),
    ).toBeNull();
  });
});

describe("rentabilidad real", () => {
  it("descuenta la inflacion de forma compuesta", () => {
    expect(realReturnPercent(10, 4)).toBe(5.77);
    expect(realReturnPercent(3, 4)).toBe(-0.96);
    expect(realReturnPercent(5, 0)).toBe(5);
  });

  it("variacion entre dos cotizaciones", () => {
    expect(changePercent(p(40_000), p(41_600))).toBe(4);
    expect(changePercent(p(40_000), p(40_000))).toBe(0);
    expect(changePercent(0n, p(1))).toBeNull();
  });

  it("anualiza solo con 30 dias o mas", () => {
    expect(annualizePercent(1, 30)).toBeCloseTo(12.9, 1);
    expect(annualizePercent(1, 29)).toBeNull();
    expect(annualizePercent(4, 365)).toBe(4);
  });
});
