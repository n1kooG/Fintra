import { describe, expect, it } from "vitest";
import { CRYPTO_ASSETS, cryptoAsset, parseCoinGeckoPrices } from "./crypto";

describe("catalogo", () => {
  it("codigos e ids unicos", () => {
    expect(new Set(CRYPTO_ASSETS.map((a) => a.code)).size).toBe(CRYPTO_ASSETS.length);
    expect(new Set(CRYPTO_ASSETS.map((a) => a.id)).size).toBe(CRYPTO_ASSETS.length);
  });

  it("busca por codigo", () => {
    expect(cryptoAsset("BTC")?.id).toBe("bitcoin");
    expect(cryptoAsset("NOPE")).toBeNull();
    expect(cryptoAsset(null)).toBeNull();
  });
});

describe("parseCoinGeckoPrices", () => {
  it("lee el precio en la moneda pedida, escalado a 6 decimales", () => {
    const payload = {
      bitcoin: { clp: 95_000_000, usd: 100_000.5 },
      ethereum: { clp: 3_100_000.25, usd: 3_200 },
    };
    const clp = parseCoinGeckoPrices(payload, "CLP");
    expect(clp.get("bitcoin")).toBe(95_000_000_000_000n);
    expect(clp.get("ethereum")).toBe(3_100_000_250_000n);
    expect(parseCoinGeckoPrices(payload, "USD").get("bitcoin")).toBe(100_000_500_000n);
  });

  it("precios muy pequenos no caen en notacion cientifica", () => {
    const out = parseCoinGeckoPrices({ dogecoin: { usd: 0.000012 } }, "USD");
    expect(out.get("dogecoin")).toBe(12n);
  });

  it("ignora lo malformado sin tirar el resto", () => {
    const out = parseCoinGeckoPrices(
      {
        bitcoin: { clp: 95_000_000 },
        ethereum: { clp: "caro" },
        solana: { clp: 0 },
        cardano: { clp: -5 },
        ripple: {},
        litecoin: null,
        dogecoin: { usd: 1 },
      },
      "CLP",
    );
    expect([...out.keys()]).toEqual(["bitcoin"]);
  });

  it("una respuesta que no es un objeto no produce precios", () => {
    expect(parseCoinGeckoPrices(null, "CLP").size).toBe(0);
    expect(parseCoinGeckoPrices("error", "CLP").size).toBe(0);
    expect(parseCoinGeckoPrices([], "CLP").size).toBe(0);
  });
});
