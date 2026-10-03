import { describe, expect, it } from "vitest";
import { csvRaw, csvText, formatDecimalComma, toCsv } from "./csv";

describe("csvText", () => {
  it("texto normal pasa tal cual", () => {
    expect(csvText("Supermercado Lider")).toBe("Supermercado Lider");
    expect(csvText(null)).toBe("");
    expect(csvText("")).toBe("");
  });

  it("entrecomilla y escapa comillas, separador y saltos de linea", () => {
    expect(csvText('Pizza "La Nonna"')).toBe('"Pizza ""La Nonna"""');
    expect(csvText("Arroz; fideos")).toBe('"Arroz; fideos"');
    expect(csvText("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("neutraliza formulas que Excel ejecutaria al abrir el archivo", () => {
    expect(csvText('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvText("+56912345678")).toBe("'+56912345678");
    expect(csvText("-cmd")).toBe("'-cmd");
    expect(csvText("@SUMA(A1)")).toBe("'@SUMA(A1)");
    expect(csvText("\t=1+1")).toBe("'\t=1+1");
  });

  it("un signo en medio del texto no es una formula", () => {
    expect(csvText("Tienda = barata")).toBe("Tienda = barata");
  });
});

describe("csvRaw", () => {
  it("no toca numeros negativos (no son formulas de texto del usuario)", () => {
    expect(csvRaw("-1234,50")).toBe("-1234,50");
    expect(csvRaw("2026-10-02")).toBe("2026-10-02");
  });
});

describe("formatDecimalComma", () => {
  it("CLP sin decimales, otras monedas con coma decimal y sin separador de miles", () => {
    expect(formatDecimalComma(-1234567n, "CLP")).toBe("-1234567");
    expect(formatDecimalComma(1050n, "USD")).toBe("10,50");
    expect(formatDecimalComma(-5n, "USD")).toBe("-0,05");
    expect(formatDecimalComma(4100810n, "UF")).toBe("41008,10");
    expect(formatDecimalComma(0n, "CLP")).toBe("0");
  });
});

describe("toCsv", () => {
  it("separa columnas con ; y filas con CRLF", () => {
    expect(
      toCsv([
        ["fecha", "monto"],
        ["2026-10-02", "-1000"],
      ]),
    ).toBe("fecha;monto\r\n2026-10-02;-1000\r\n");
  });
});
