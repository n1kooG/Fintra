import { describe, expect, it } from "vitest";
import { pageWindow, parsePageParam } from "./pagination";

describe("pageWindow", () => {
  it("calcula la primera pagina de una lista larga", () => {
    const w = pageWindow(312, 1, 50);
    expect(w).toMatchObject({
      page: 1,
      pages: 7,
      offset: 0,
      first: 1,
      last: 50,
      hasPrev: false,
      hasNext: true,
    });
  });

  it("la ultima pagina muestra solo las filas que quedan", () => {
    const w = pageWindow(312, 7, 50);
    expect(w).toMatchObject({
      offset: 300,
      first: 301,
      last: 312,
      hasPrev: true,
      hasNext: false,
    });
  });

  it("una pagina fuera de rango cae en la ultima", () => {
    expect(pageWindow(312, 999, 50).page).toBe(7);
  });

  it("una pagina cero o negativa cae en la primera", () => {
    expect(pageWindow(312, 0, 50).page).toBe(1);
    expect(pageWindow(312, -3, 50).page).toBe(1);
  });

  it("una lista vacia tiene una pagina y no muestra filas", () => {
    expect(pageWindow(0, 1, 50)).toMatchObject({
      pages: 1,
      first: 0,
      last: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  it("un total exacto no genera una pagina vacia de mas", () => {
    expect(pageWindow(100, 2, 50)).toMatchObject({
      pages: 2,
      first: 51,
      last: 100,
      hasNext: false,
    });
  });
});

describe("parsePageParam", () => {
  it("lee enteros validos", () => {
    expect(parsePageParam("3")).toBe(3);
  });

  it("ignora valores invalidos", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
  });
});
