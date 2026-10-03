import { describe, expect, it } from "vitest";
import {
  fromGross,
  fromNet,
  formatRetention,
  retentionBps,
  RETENTION_BPS_BY_YEAR,
} from "./honorarios";

describe("retentionBps", () => {
  it("sigue el calendario de la Ley 21.133", () => {
    expect(retentionBps(2019)).toBe(1000);
    expect(retentionBps(2025)).toBe(1450);
    expect(retentionBps(2026)).toBe(1525);
    expect(retentionBps(2027)).toBe(1600);
    expect(retentionBps(2028)).toBe(1700);
  });

  it("antes y despues de la tabla usa el extremo mas cercano", () => {
    expect(retentionBps(2015)).toBe(1000);
    expect(retentionBps(2035)).toBe(1700);
  });

  it("la retencion nunca baja de un anio al siguiente", () => {
    const years = Object.keys(RETENTION_BPS_BY_YEAR).map(Number).sort();
    for (let i = 1; i < years.length; i++) {
      expect(RETENTION_BPS_BY_YEAR[years[i]]).toBeGreaterThan(
        RETENTION_BPS_BY_YEAR[years[i - 1]],
      );
    }
  });
});

describe("formatRetention", () => {
  it("usa coma decimal y sin ceros sobrantes", () => {
    expect(formatRetention(2026)).toBe("15,25%");
    expect(formatRetention(2028)).toBe("17%");
    expect(formatRetention(2019)).toBe("10%");
    expect(formatRetention(2020)).toBe("10,75%");
  });
});

describe("fromGross", () => {
  it("calcula la retencion y el liquido (2026: 15,25%)", () => {
    expect(fromGross(1_000_000n, 2026)).toEqual({
      grossMinor: 1_000_000n,
      retentionMinor: 152_500n,
      netMinor: 847_500n,
    });
  });

  it("redondea la retencion al peso mas cercano", () => {
    // 333 * 15,25% = 50,7825 -> 51
    expect(fromGross(333n, 2026).retentionMinor).toBe(51n);
    // 10 * 15,25% = 1,525 -> 2
    expect(fromGross(10n, 2026).retentionMinor).toBe(2n);
    // 3 * 15,25% = 0,4575 -> 0
    expect(fromGross(3n, 2026).retentionMinor).toBe(0n);
  });

  it("bruto = retencion + liquido siempre", () => {
    for (const gross of [1n, 7n, 999n, 123_457n, 5_000_000n]) {
      const r = fromGross(gross, 2027);
      expect(r.retentionMinor + r.netMinor).toBe(gross);
    }
  });

  it("monto cero", () => {
    expect(fromGross(0n, 2026)).toEqual({
      grossMinor: 0n,
      retentionMinor: 0n,
      netMinor: 0n,
    });
  });
});

describe("fromNet", () => {
  it("de lo que quiero recibir al bruto de la boleta", () => {
    const r = fromNet(847_500n, 2026);
    expect(r.grossMinor).toBe(1_000_000n);
    expect(r.netMinor).toBe(847_500n);
  });

  it("ida y vuelta: el bruto resultante entrega al menos el liquido pedido, y uno menos no", () => {
    for (const year of [2024, 2026, 2028]) {
      for (const net of [1n, 100n, 99_999n, 500_000n, 1_234_567n, 10_000_000n]) {
        const r = fromNet(net, year);
        expect(r.netMinor, `${year}/${net}`).toBeGreaterThanOrEqual(net);
        expect(
          fromGross(r.grossMinor - 1n, year).netMinor,
          `${year}/${net}`,
        ).toBeLessThan(net);
      }
    }
  });

  it("cuando existe un bruto exacto, lo encuentra", () => {
    for (const gross of [200_000n, 750_000n, 2_000_000n]) {
      const net = fromGross(gross, 2026).netMinor;
      expect(fromNet(net, 2026).netMinor).toBe(net);
    }
  });

  it("monto cero", () => {
    expect(fromNet(0n, 2026).grossMinor).toBe(0n);
  });
});
