import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatMonthLabel,
  monthBounds,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
} from "./dates";

describe("meses", () => {
  it("monthKeyOf y parseMonthKey", () => {
    expect(monthKeyOf("2026-10-15")).toBe("2026-10");
    expect(parseMonthKey("2026-10")).toBe("2026-10");
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey(undefined)).toBeNull();
  });

  it("monthBounds respeta largos de mes y bisiestos", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2026-02").to).toBe("2026-02-28");
    expect(monthBounds("2028-02").to).toBe("2028-02-29");
  });

  it("shiftMonth cruza de anio en ambas direcciones", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
  });

  it("formatMonthLabel en espanol", () => {
    expect(formatMonthLabel("2026-10")).toBe("octubre de 2026");
  });
});

describe("daysBetween", () => {
  it("cuenta dias de calendario con signo", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(0);
  });
});
