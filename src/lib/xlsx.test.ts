import { describe, expect, it } from "vitest";
import {
  buildXlsx,
  columnLetter,
  crc32,
  date,
  decimalString,
  escapeXml,
  excelSerial,
  money,
  safeSheetName,
  text,
  zipStore,
} from "./xlsx";

/** Lee un ZIP "store" generado por zipStore: devuelve nombre -> contenido, validando CRC y tamanos. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Registro de fin de directorio central (sin comentario): ultimos 22 bytes.
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const local = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(local + 26, true);
    const start = local + 30 + localNameLen;
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    pos += 46 + nameLen;
  }
  return out;
}

const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("helpers", () => {
  it("crc32 coincide con el valor conocido de '123456789'", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("columnLetter", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });

  it("excelSerial usa la base 1899-12-30 de Excel", () => {
    expect(excelSerial("1900-01-01")).toBe(2);
    expect(excelSerial("2000-01-01")).toBe(36526);
    expect(excelSerial("2026-10-03")).toBe(46298);
  });

  it("decimalString sin pasar por float", () => {
    expect(decimalString(-450_000n, "CLP")).toBe("-450000");
    expect(decimalString(-1_050n, "USD")).toBe("-10.50");
    expect(decimalString(5n, "USD")).toBe("0.05");
    expect(decimalString(9_007_199_254_740_993n, "CLP")).toBe("9007199254740993");
  });

  it("money: CLP sin decimales, el resto con 2", () => {
    expect(money(1_000n, "CLP")).toMatchObject({ decimals: 0, value: "1000" });
    expect(money(1_000n, "USD")).toMatchObject({ decimals: 2, value: "10.00" });
  });

  it("escapeXml y caracteres ilegales", () => {
    expect(escapeXml('a & b < c > "d"')).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
    expect(escapeXml("ok\u0001\u0008fin")).toBe("okfin");
  });

  it("safeSheetName", () => {
    expect(safeSheetName("Mov: 2026/10?")).toBe("Mov  2026 10");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
    expect(safeSheetName("///")).toBe("Hoja1");
  });
});

describe("zipStore", () => {
  it("guarda y recupera archivos con CRC valido", () => {
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: "a.txt", data: enc.encode("hola") },
      { name: "carpeta/ñandú.txt", data: enc.encode("contenido ñ") },
    ]);
    const files = unzip(zip);
    expect(decode(files.get("a.txt"))).toBe("hola");
    expect(decode(files.get("carpeta/ñandú.txt"))).toBe("contenido ñ");
  });

  it("es determinista (misma entrada, mismos bytes)", () => {
    const entries = [{ name: "a", data: new TextEncoder().encode("x") }];
    expect(Array.from(zipStore(entries))).toEqual(Array.from(zipStore(entries)));
  });
});

describe("buildXlsx", () => {
  const sheet = {
    name: "Movimientos",
    columns: [
      { header: "fecha" },
      { header: "comercio", width: 30 },
      { header: "monto" },
    ],
    rows: [
      [date("2026-10-03"), text('=HYPERLINK("http://x")'), money(-12_345n, "CLP")],
      [date("2026-10-04"), text("Café & <té>"), money(-1_050n, "USD")],
      [date("2026-10-05"), text(null), money(0n, "CLP")],
    ],
  };
  const files = unzip(buildXlsx(sheet));

  it("incluye las partes minimas de un libro", () => {
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("todos los XML estan bien formados (etiquetas balanceadas)", () => {
    for (const [name, data] of files) {
      const xml = decode(data);
      expect(xml.startsWith("<?xml"), name).toBe(true);
      const stack: string[] = [];
      for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
        const [, closing, tag, selfClosing] = m;
        if (selfClosing) continue;
        if (closing) expect(stack.pop(), `${name}: </${tag}>`).toBe(tag);
        else stack.push(tag);
      }
      expect(stack, name).toEqual([]);
    }
  });

  it("encabezado en negrita, filtros y primera fila fija", () => {
    const xml = decode(files.get("xl/worksheets/sheet1.xml"));
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t>fecha</t></is></c>');
    expect(xml).toContain('<autoFilter ref="A1:C4"/>');
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
  });

  it("fechas como serie y montos como numeros con su formato", () => {
    const xml = decode(files.get("xl/worksheets/sheet1.xml"));
    expect(xml).toContain('<c r="A2" s="2"><v>46298</v></c>');
    expect(xml).toContain('<c r="C2" s="3"><v>-12345</v></c>');
    expect(xml).toContain('<c r="C3" s="4"><v>-10.50</v></c>');
  });

  it("el texto va como cadena (una formula no se ejecuta) y escapado", () => {
    const xml = decode(files.get("xl/worksheets/sheet1.xml"));
    expect(xml).toContain(
      '<c r="B2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t></is></c>',
    );
    expect(xml).not.toContain("<f>");
    expect(xml).toContain("Café &amp; &lt;té&gt;");
  });

  it("las celdas de texto vacias se omiten", () => {
    const xml = decode(files.get("xl/worksheets/sheet1.xml"));
    expect(xml).not.toContain('r="B4"');
    expect(xml).toContain('<c r="C4" s="3"><v>0</v></c>');
  });

  it("sin filas igual genera un libro valido", () => {
    const empty = unzip(
      buildXlsx({ name: "Vacia", columns: [{ header: "a" }], rows: [] }),
    );
    expect(decode(empty.get("xl/worksheets/sheet1.xml"))).toContain(
      '<autoFilter ref="A1:A1"/>',
    );
  });
});
