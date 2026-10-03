import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

function headers(init: Record<string, string>) {
  return new Headers(init);
}

describe("isSameOrigin", () => {
  it("acepta cuando Origin coincide con el host", () => {
    expect(
      isSameOrigin(
        headers({ origin: "https://fintra.vercel.app", host: "fintra.vercel.app" }),
      ),
    ).toBe(true);
  });

  it("usa x-forwarded-host detras de un proxy", () => {
    expect(
      isSameOrigin(
        headers({
          origin: "https://fintra.vercel.app",
          host: "interno:3000",
          "x-forwarded-host": "fintra.vercel.app",
        }),
      ),
    ).toBe(true);
  });

  it("rechaza otro origen", () => {
    expect(
      isSameOrigin(
        headers({ origin: "https://malo.example", host: "fintra.vercel.app" }),
      ),
    ).toBe(false);
  });

  it("rechaza si falta Origin", () => {
    expect(isSameOrigin(headers({ host: "fintra.vercel.app" }))).toBe(false);
  });

  it("rechaza un Origin que no es una URL", () => {
    expect(isSameOrigin(headers({ origin: "null", host: "fintra.vercel.app" }))).toBe(
      false,
    );
  });

  it("no se deja engañar por un subdominio parecido", () => {
    expect(
      isSameOrigin(
        headers({
          origin: "https://fintra.vercel.app.malo.example",
          host: "fintra.vercel.app",
        }),
      ),
    ).toBe(false);
  });
});
