import { describe, expect, it } from "vitest";
import { signedPercent } from "./percent";

describe("signedPercent", () => {
  it("el signo siempre va impreso", () => {
    expect(signedPercent(8.4)).toBe("+8,4%");
    expect(signedPercent(-5.1)).toBe("−5,1%");
    expect(signedPercent(0)).toBe("0,0%");
  });

  it("sin base de comparacion, un guion", () => {
    expect(signedPercent(null)).toBe("—");
  });

  it("un decimal y coma decimal chilena", () => {
    expect(signedPercent(150)).toBe("+150,0%");
    expect(signedPercent(-33.3)).toBe("−33,3%");
  });
});
