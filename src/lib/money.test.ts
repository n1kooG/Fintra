import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatMoney,
  fromMinorUnits,
  sumAmounts,
  toMinorUnits,
} from "./money";

describe("toMinorUnits / fromMinorUnits", () => {
  it("ida y vuelta para CLP (sin decimales)", () => {
    expect(toMinorUnits(38450, "CLP")).toBe(38450n);
    expect(fromMinorUnits(38450n, "CLP")).toBe(38450);
  });

  it("ida y vuelta para USD (2 decimales)", () => {
    expect(toMinorUnits(10.5, "USD")).toBe(1050n);
    expect(fromMinorUnits(1050n, "USD")).toBe(10.5);
  });

  it("redondea montos con error de coma flotante", () => {
    // 0.1 + 0.2 en JS da 0.30000000000000004
    expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30n);
  });
});

describe("formatAmount", () => {
  it("agrupa miles con punto, sin signo por defecto en positivos", () => {
    expect(formatAmount(1850000n, "CLP")).toBe("1.850.000");
  });

  it("muestra el signo menos en negativos siempre", () => {
    expect(formatAmount(-38450n, "CLP")).toBe("-38.450");
  });

  it("signDisplay 'always' agrega + en positivos", () => {
    expect(formatAmount(1850000n, "CLP", { signDisplay: "always" })).toBe("+1.850.000");
  });

  it("signDisplay 'never' nunca muestra signo, ni en negativos", () => {
    expect(formatAmount(-38450n, "CLP", { signDisplay: "never" })).toBe("38.450");
  });

  it("USD muestra 2 decimales separados por coma", () => {
    expect(formatAmount(105000n, "USD")).toBe("1.050,00");
  });

  it("el monto cero nunca lleva signo, ni con signDisplay 'always'", () => {
    // 0 no es entrada ni salida — "+0" seria enganoso.
    expect(formatAmount(0n, "CLP")).toBe("0");
    expect(formatAmount(0n, "CLP", { signDisplay: "always" })).toBe("0");
  });
});

describe("formatMoney", () => {
  it("antepone el simbolo de la moneda", () => {
    expect(formatMoney(842350n, "CLP")).toBe("$842.350");
    expect(formatMoney(31200n, "USD")).toBe("US$312,00");
  });

  it("el signo va antes del simbolo, no despues", () => {
    expect(formatMoney(-156400n, "CLP", { signDisplay: "always" })).toBe("-$156.400");
    expect(formatMoney(1850000n, "CLP", { signDisplay: "always" })).toBe("+$1.850.000");
  });
});

describe("sumAmounts", () => {
  it("suma una lista de montos en unidades minimas", () => {
    expect(sumAmounts([1000n, -400n, 250n])).toBe(850n);
  });

  it("devuelve 0n para una lista vacia", () => {
    expect(sumAmounts([])).toBe(0n);
  });
});
