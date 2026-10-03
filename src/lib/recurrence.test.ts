import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES_PER_RUN,
  addMonthsClamped,
  dueOccurrences,
  nextOccurrenceAfter,
  occurrencesBetween,
  type RecurrenceRule,
} from "./recurrence";

describe("addMonthsClamped", () => {
  it("recorta al ultimo dia del mes destino", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("cruza de anio en ambas direcciones", () => {
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("occurrencesBetween", () => {
  it("mensual del 31 vuelve al 31 despues de febrero (no se corre)", () => {
    const rule: RecurrenceRule = {
      startDate: "2026-01-31",
      frequency: "monthly",
      endDate: null,
    };
    expect(occurrencesBetween(rule, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("semanal y quincenal", () => {
    expect(
      occurrencesBetween(
        { startDate: "2026-09-01", frequency: "weekly", endDate: null },
        "2026-09-01",
        "2026-09-22",
      ),
    ).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
    expect(
      occurrencesBetween(
        { startDate: "2026-09-01", frequency: "biweekly", endDate: null },
        "2026-09-02",
        "2026-10-31",
      ),
    ).toEqual(["2026-09-15", "2026-09-29", "2026-10-13", "2026-10-27"]);
  });

  it("anual del 29 de febrero cae el 28 en anios no bisiestos", () => {
    expect(
      occurrencesBetween(
        { startDate: "2028-02-29", frequency: "yearly", endDate: null },
        "2028-01-01",
        "2032-12-31",
      ),
    ).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("respeta la fecha de termino", () => {
    expect(
      occurrencesBetween(
        { startDate: "2026-01-05", frequency: "monthly", endDate: "2026-03-05" },
        "2026-01-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-01-05", "2026-02-05", "2026-03-05"]);
  });
});

describe("nextOccurrenceAfter", () => {
  const rule: RecurrenceRule = {
    startDate: "2026-01-05",
    frequency: "monthly",
    endDate: null,
  };

  it("es estrictamente posterior", () => {
    expect(nextOccurrenceAfter(rule, "2026-09-05")).toBe("2026-10-05");
    expect(nextOccurrenceAfter(rule, "2026-09-04")).toBe("2026-09-05");
  });

  it("antes del inicio devuelve el inicio", () => {
    expect(nextOccurrenceAfter(rule, "2025-12-31")).toBe("2026-01-05");
  });

  it("null si la regla ya termino", () => {
    expect(
      nextOccurrenceAfter({ ...rule, endDate: "2026-03-05" }, "2026-03-05"),
    ).toBeNull();
  });
});

describe("dueOccurrences", () => {
  const rule = {
    startDate: "2026-01-05",
    frequency: "monthly" as const,
    endDate: null,
  };

  it("genera las vencidas y avanza a la siguiente futura", () => {
    expect(dueOccurrences({ ...rule, nextRunOn: "2026-08-05" }, "2026-09-24")).toEqual({
      dates: ["2026-08-05", "2026-09-05"],
      nextRunOn: "2026-10-05",
    });
  });

  it("incluye la de hoy", () => {
    expect(dueOccurrences({ ...rule, nextRunOn: "2026-09-05" }, "2026-09-05")).toEqual({
      dates: ["2026-09-05"],
      nextRunOn: "2026-10-05",
    });
  });

  it("si no hay nada vencido no toca la proxima fecha", () => {
    expect(dueOccurrences({ ...rule, nextRunOn: "2026-10-05" }, "2026-09-24")).toEqual({
      dates: [],
      nextRunOn: "2026-10-05",
    });
  });

  it("al llegar al tope por corrida deja la proxima fecha en el pasado para retomar", () => {
    const weekly = {
      startDate: "2020-01-01",
      frequency: "weekly" as const,
      endDate: null,
      nextRunOn: "2020-01-01",
    };
    const result = dueOccurrences(weekly, "2026-09-24");
    expect(result.dates).toHaveLength(MAX_OCCURRENCES_PER_RUN);
    expect(result.nextRunOn! < "2026-09-24").toBe(true);
    expect(result.nextRunOn! > result.dates.at(-1)!).toBe(true);
  });

  it("marca la regla como terminada al pasar su fecha de termino", () => {
    expect(
      dueOccurrences(
        { ...rule, endDate: "2026-09-05", nextRunOn: "2026-09-05" },
        "2026-09-24",
      ),
    ).toEqual({ dates: ["2026-09-05"], nextRunOn: null });
  });
});
