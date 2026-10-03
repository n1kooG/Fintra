import { describe, expect, it } from "vitest";
import { goalProgress } from "./goals";

const TODAY = "2026-10-01";
const contributions = [
  { amountMinor: 100000n, occurredOn: "2026-09-01" },
  { amountMinor: 100000n, occurredOn: "2026-09-15" },
];

describe("goalProgress", () => {
  it("suma lo ahorrado, lo que falta y el porcentaje", () => {
    const p = goalProgress(
      { targetMinor: 1000000n, targetDate: null, contributions },
      TODAY,
    );
    expect(p.savedMinor).toBe(200000n);
    expect(p.remainingMinor).toBe(800000n);
    expect(p.percent).toBe(20);
  });

  it("proyecta la fecha al ritmo de la ventana reciente (31 dias desde el primer aporte)", () => {
    const p = goalProgress(
      { targetMinor: 1000000n, targetDate: null, contributions },
      TODAY,
    );
    // 200.000 en 31 dias -> 800.000 restantes = 124 dias.
    expect(p.projectedDate).toBe("2027-02-02");
    expect(p.paceMinorPerMonth).toBe(193548n);
    expect(p.status).toBe("no_date");
    expect(p.requiredPerMonthMinor).toBeNull();
  });

  it("con fecha objetivo: a tiempo si la proyeccion llega antes", () => {
    const p = goalProgress(
      { targetMinor: 1000000n, targetDate: "2027-03-01", contributions },
      TODAY,
    );
    expect(p.status).toBe("on_track");
  });

  it("con fecha objetivo: atrasada si la proyeccion llega despues, y dice cuanto aportar por mes", () => {
    const p = goalProgress(
      { targetMinor: 1000000n, targetDate: "2027-01-01", contributions },
      TODAY,
    );
    expect(p.status).toBe("behind");
    // 92 dias por delante: 800.000 * 30 / 92 = 260.869,6 -> 260.870 por mes.
    expect(p.requiredPerMonthMinor).toBe(260870n);
  });

  it("con menos de un mes por delante, lo requerido es lo que falta (no se extrapola)", () => {
    const p = goalProgress(
      {
        targetMinor: 1000000n,
        targetDate: "2026-10-11",
        contributions: [{ amountMinor: 900000n, occurredOn: "2026-09-20" }],
      },
      TODAY,
    );
    expect(p.requiredPerMonthMinor).toBe(100000n);
  });

  it("cumplida: sin proyeccion ni monto requerido, porcentaje topado en 100", () => {
    const p = goalProgress(
      {
        targetMinor: 150000n,
        targetDate: "2027-01-01",
        contributions,
      },
      TODAY,
    );
    expect(p.status).toBe("completed");
    expect(p.percent).toBe(100);
    expect(p.remainingMinor).toBe(0n);
    expect(p.projectedDate).toBeNull();
    expect(p.requiredPerMonthMinor).toBeNull();
  });

  it("aportes con fecha futura todavia no cuentan", () => {
    const p = goalProgress(
      {
        targetMinor: 1000000n,
        targetDate: null,
        contributions: [{ amountMinor: 500000n, occurredOn: "2026-11-01" }],
      },
      TODAY,
    );
    expect(p.savedMinor).toBe(0n);
    expect(p.status).toBe("no_pace");
  });

  it("aportes viejos (fuera de la ventana de 90 dias) cuentan como ahorrado pero no dan ritmo", () => {
    const p = goalProgress(
      {
        targetMinor: 1000000n,
        targetDate: "2027-06-01",
        contributions: [{ amountMinor: 300000n, occurredOn: "2026-05-01" }],
      },
      TODAY,
    );
    expect(p.savedMinor).toBe(300000n);
    expect(p.paceMinorPerMonth).toBe(0n);
    expect(p.projectedDate).toBeNull();
    expect(p.status).toBe("no_pace");
  });

  it("fecha objetivo ya vencida sin cumplir: atrasada aunque haya ritmo", () => {
    const p = goalProgress(
      { targetMinor: 1000000n, targetDate: "2026-09-30", contributions },
      TODAY,
    );
    expect(p.status).toBe("behind");
    expect(p.requiredPerMonthMinor).toBeNull();
  });

  it("un primer aporte reciente no dispara un ritmo absurdo (ventana minima de 30 dias)", () => {
    const p = goalProgress(
      {
        targetMinor: 1000000n,
        targetDate: null,
        contributions: [{ amountMinor: 100000n, occurredOn: TODAY }],
      },
      TODAY,
    );
    // 100.000 / 30 dias -> faltan 900.000 = 270 dias, no 9.
    expect(p.paceMinorPerMonth).toBe(100000n);
    expect(p.projectedDate).toBe("2027-06-28");
  });
});
