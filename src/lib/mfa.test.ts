import { describe, expect, it } from "vitest";
import { needsSecondFactor, parseTotpCode } from "./mfa";

describe("needsSecondFactor", () => {
  it("sin factores no se pide nada", () => {
    expect(needsSecondFactor([], "aal1")).toBe(false);
    expect(needsSecondFactor(undefined, "aal1")).toBe(false);
    expect(needsSecondFactor(null, null)).toBe(false);
  });

  it("un factor sin verificar (enrolamiento a medias) no bloquea el ingreso", () => {
    expect(needsSecondFactor([{ status: "unverified" }], "aal1")).toBe(false);
  });

  it("con un factor verificado y sesion aal1 se pide el codigo", () => {
    expect(needsSecondFactor([{ status: "verified" }], "aal1")).toBe(true);
    expect(needsSecondFactor([{ status: "verified" }], null)).toBe(true);
    expect(
      needsSecondFactor([{ status: "unverified" }, { status: "verified" }], "aal1"),
    ).toBe(true);
  });

  it("ya en aal2 (o aal3) no se vuelve a pedir", () => {
    expect(needsSecondFactor([{ status: "verified" }], "aal2")).toBe(false);
    expect(needsSecondFactor([{ status: "verified" }], "aal3")).toBe(false);
  });
});

describe("parseTotpCode", () => {
  it("acepta 6 digitos, con o sin espacios y guion", () => {
    expect(parseTotpCode("123456")).toBe("123456");
    expect(parseTotpCode(" 123 456 ")).toBe("123456");
    expect(parseTotpCode("123-456")).toBe("123456");
    expect(parseTotpCode("000000")).toBe("000000");
  });

  it("rechaza lo que no son exactamente 6 digitos", () => {
    for (const bad of [
      "12345",
      "1234567",
      "12345a",
      "",
      "abcdef",
      "12 34",
      "１２３４５６",
    ]) {
      expect(parseTotpCode(bad), bad).toBeNull();
    }
    expect(parseTotpCode(null)).toBeNull();
    expect(parseTotpCode(123456)).toBeNull();
    expect(parseTotpCode(undefined)).toBeNull();
  });
});
