import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("deja pasar rutas internas con consulta y ancla", () => {
    expect(safeNextPath("/movimientos?cuenta=1&pagina=2#x")).toBe(
      "/movimientos?cuenta=1&pagina=2#x",
    );
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("usa el valor por defecto si falta", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("", "/inicio")).toBe("/inicio");
  });

  it.each([
    "https://evil.com",
    "http://evil.com/x",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "@evil.com",
    ".evil.com",
    "evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
    "/\n/evil.com",
    "/ok\r\nSet-Cookie: x=1",
  ])("rechaza %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/dashboard");
  });

  it("una ruta con %2F codificado sigue siendo interna", () => {
    expect(safeNextPath("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
  });
});
