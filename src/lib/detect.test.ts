import { describe, expect, it } from "vitest";
import {
  detectRecurringCharges,
  detectSmallSpending,
  type ExpenseRecord,
} from "./detect";

const rec = (date: string, merchant: string, amount: number): ExpenseRecord => ({
  date,
  merchant,
  amountMinor: BigInt(amount),
});

describe("detectRecurringCharges", () => {
  it("detecta una suscripcion mensual y la anualiza", () => {
    const found = detectRecurringCharges([
      rec("2026-06-12", "Netflix", 9990),
      rec("2026-07-12", "NETFLIX", 9990),
      rec("2026-08-13", "Netflix", 9990),
      rec("2026-09-12", "Netflix", 9990),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: "netflix",
      cadence: "monthly",
      count: 4,
      typicalMinor: 9990n,
      annualizedMinor: 9990n * 12n,
      lastDate: "2026-09-12",
    });
    // Mediana de intervalos: 30 dias -> proximo cargo esperado.
    expect(found[0].nextExpected).toBe("2026-10-12");
  });

  it("tolera tildes y mayusculas en el nombre del comercio", () => {
    const found = detectRecurringCharges([
      rec("2026-06-01", "Café Ñuñoa Club", 12000),
      rec("2026-07-01", "cafe ñuñoa club", 12000),
      rec("2026-08-01", "CAFE ÑUÑOA CLUB", 12000),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(3);
  });

  it("monto parecido (hasta 15%) sigue siendo el mismo cargo", () => {
    const found = detectRecurringCharges([
      rec("2026-06-05", "Gym", 30000),
      rec("2026-07-05", "Gym", 31000),
      rec("2026-08-05", "Gym", 32500),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].typicalMinor).toBe(31000n);
  });

  it("monto muy variable no es suscripcion (el supermercado, aunque sea mensual)", () => {
    expect(
      detectRecurringCharges([
        rec("2026-06-05", "Lider", 30000),
        rec("2026-07-05", "Lider", 90000),
        rec("2026-08-05", "Lider", 15000),
      ]),
    ).toEqual([]);
  });

  it("intervalos irregulares no cuentan", () => {
    expect(
      detectRecurringCharges([
        rec("2026-06-01", "Kiosco", 5000),
        rec("2026-06-09", "Kiosco", 5000),
        rec("2026-07-20", "Kiosco", 5000),
        rec("2026-08-02", "Kiosco", 5000),
      ]),
    ).toEqual([]);
  });

  it("necesita al menos 3 cargos (2 si es anual)", () => {
    expect(
      detectRecurringCharges([
        rec("2026-06-12", "Spotify", 5000),
        rec("2026-07-12", "Spotify", 5000),
      ]),
    ).toEqual([]);
    const yearly = detectRecurringCharges([
      rec("2024-03-10", "Dominio web", 15000),
      rec("2025-03-10", "Dominio web", 15000),
    ]);
    expect(yearly).toHaveLength(1);
    expect(yearly[0]).toMatchObject({ cadence: "yearly", annualizedMinor: 15000n });
  });

  it("detecta cadencia semanal y quincenal", () => {
    const weekly = detectRecurringCharges([
      rec("2026-09-01", "Feria", 8000),
      rec("2026-09-08", "Feria", 8000),
      rec("2026-09-15", "Feria", 8000),
      rec("2026-09-22", "Feria", 8000),
    ]);
    expect(weekly[0]).toMatchObject({ cadence: "weekly", annualizedMinor: 8000n * 52n });
    const biweekly = detectRecurringCharges([
      rec("2026-08-01", "Aseo", 20000),
      rec("2026-08-15", "Aseo", 20000),
      rec("2026-08-29", "Aseo", 20000),
    ]);
    expect(biweekly[0].cadence).toBe("biweekly");
  });

  it("varios cargos el mismo dia cuentan como uno", () => {
    const found = detectRecurringCharges([
      rec("2026-06-12", "Apple", 4000),
      rec("2026-06-12", "Apple", 1000),
      rec("2026-07-12", "Apple", 5000),
      rec("2026-08-12", "Apple", 5000),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(3);
    expect(found[0].typicalMinor).toBe(5000n);
  });

  it("ordena por costo anual y descarta comercios sin nombre", () => {
    const found = detectRecurringCharges([
      rec("2026-06-01", "Barata", 1000),
      rec("2026-07-01", "Barata", 1000),
      rec("2026-08-01", "Barata", 1000),
      rec("2026-06-02", "Cara", 50000),
      rec("2026-07-02", "Cara", 50000),
      rec("2026-08-02", "Cara", 50000),
      rec("2026-06-03", "   ", 999),
      rec("2026-07-03", "   ", 999),
      rec("2026-08-03", "   ", 999),
    ]);
    expect(found.map((f) => f.key)).toEqual(["cara", "barata"]);
  });
});

describe("detectSmallSpending", () => {
  const today = "2026-10-01";
  const coffee = [
    rec("2026-09-28", "Cafe Altura", 2500),
    rec("2026-09-20", "Cafe Altura", 2500),
    rec("2026-09-11", "Cafe Altura", 3000),
    rec("2026-09-02", "Cafe Altura", 2500),
    rec("2026-08-15", "Cafe Altura", 2500),
  ];

  it("agrupa compras chicas y frecuentes y anualiza el ritmo de la ventana", () => {
    const found = detectSmallSpending({ records: coffee, today, thresholdMinor: 8000n });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: "cafe altura",
      count: 5,
      totalMinor: 13000n,
      averageMinor: 2600n,
    });
    // 13.000 en 90 dias: 4.333 al mes, 52.722 al anio.
    expect(found[0].monthlyMinor).toBe(4333n);
    expect(found[0].annualizedMinor).toBe(52722n);
  });

  it("ignora las compras sobre el umbral y las fuera de la ventana", () => {
    const found = detectSmallSpending({
      records: [
        ...coffee,
        rec("2026-09-25", "Cafe Altura", 50000),
        rec("2026-05-01", "Cafe Altura", 2500),
      ],
      today,
      thresholdMinor: 8000n,
    });
    expect(found[0].count).toBe(5);
  });

  it("necesita un minimo de compras", () => {
    expect(
      detectSmallSpending({ records: coffee.slice(0, 3), today, thresholdMinor: 8000n }),
    ).toEqual([]);
  });

  it("deja afuera lo ya detectado como suscripcion", () => {
    expect(
      detectSmallSpending({
        records: coffee,
        today,
        thresholdMinor: 8000n,
        excludeKeys: new Set(["cafe altura"]),
      }),
    ).toEqual([]);
  });

  it("una ventana corta (poca historia) no subestima el ritmo", () => {
    const found = detectSmallSpending({
      records: coffee.slice(0, 4),
      today,
      thresholdMinor: 8000n,
      windowDays: 30,
    });
    expect(found[0].monthlyMinor).toBe(10500n);
  });
});
