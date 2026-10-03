import { describe, expect, it } from "vitest";
import { parseMindicadorSeries, toSantiagoDate } from "./mindicador";
import { parseRate } from "./fx";

describe("toSantiagoDate", () => {
  it("medianoche de Chile en UTC (verano, T03:00Z) cae en el mismo dia local", () => {
    expect(toSantiagoDate("2026-09-24T03:00:00.000Z")).toBe("2026-09-24");
  });

  it("medianoche de Chile en UTC (invierno, T04:00Z) cae en el mismo dia local", () => {
    expect(toSantiagoDate("2026-07-01T04:00:00.000Z")).toBe("2026-07-01");
  });

  it("rechaza fechas invalidas", () => {
    expect(toSantiagoDate("no-es-fecha")).toBeNull();
  });
});

describe("parseMindicadorSeries", () => {
  it("convierte la serie en filas de cotizacion", () => {
    const rows = parseMindicadorSeries(
      {
        codigo: "dolar",
        serie: [
          { fecha: "2026-09-24T03:00:00.000Z", valor: 959.39 },
          { fecha: "2026-09-23T03:00:00.000Z", valor: 961.2 },
        ],
      },
      "USD",
    );
    expect(rows).toEqual([
      { date: "2026-09-24", currency: "USD", rate: parseRate("959.39") },
      { date: "2026-09-23", currency: "USD", rate: parseRate("961.2") },
    ]);
  });

  it("ignora puntos malformados y fechas repetidas", () => {
    const rows = parseMindicadorSeries(
      {
        serie: [
          { fecha: "2026-09-24T03:00:00.000Z", valor: 41008.1 },
          { fecha: "2026-09-24T03:00:00.000Z", valor: 41000 },
          { fecha: "basura", valor: 1 },
          { fecha: "2026-09-22T03:00:00.000Z", valor: 0 },
          { fecha: "2026-09-21T03:00:00.000Z" },
        ],
      },
      "UF",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-09-24");
  });

  it("devuelve vacio si la respuesta no tiene serie", () => {
    expect(parseMindicadorSeries(null, "UTM")).toEqual([]);
    expect(parseMindicadorSeries({ error: "x" }, "UTM")).toEqual([]);
  });
});
