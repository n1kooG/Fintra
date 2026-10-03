/**
 * Escritor minimo de planillas Excel (.xlsx) sin dependencias: una hoja con
 * encabezado en negrita, filtros, primera fila fija, fechas reales y montos
 * numericos. Un .xlsx es un ZIP de XMLs; aqui se arma con compresion "store"
 * (sin comprimir), que todas las aplicaciones aceptan.
 *
 * Los textos van como cadenas en linea (t="inlineStr"): Excel nunca las
 * evalua como formula, asi que lo que escribe el usuario (comercio, notas)
 * no puede inyectar formulas como en un CSV.
 */

import { CURRENCY_CONFIG, type Currency } from "./money";

export type XlsxCell =
  | { kind: "text"; value: string | null | undefined }
  /** `value` es un decimal en texto con punto ("-1050.5"); se escribe tal cual, sin pasar por float. */
  | { kind: "number"; value: string; decimals: 0 | 2 }
  /** "yyyy-mm-dd" real. */
  | { kind: "date"; value: string };

export type XlsxColumn = { header: string; width?: number };

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
};

/** Estilos (indices de cellXfs en styles.xml). */
const STYLE = { header: 1, date: 2, integer: 3, decimal: 4 } as const;

export const text = (value: string | null | undefined): XlsxCell => ({
  kind: "text",
  value,
});
export const date = (value: string): XlsxCell => ({ kind: "date", value });

/** Monto en unidades minimas como decimal con punto: -1050 USD -> "-10.50". */
export function decimalString(amountMinor: bigint, currency: Currency): string {
  const { minorUnits } = CURRENCY_CONFIG[currency];
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(minorUnits);
  const integer = (abs / divisor).toString();
  const fraction =
    minorUnits > 0 ? `.${(abs % divisor).toString().padStart(minorUnits, "0")}` : "";
  return `${negative ? "-" : ""}${integer}${fraction}`;
}

/** Celda numerica con los decimales propios de la moneda (CLP 0, el resto 2). */
export function money(amountMinor: bigint, currency: Currency): XlsxCell {
  const decimals = CURRENCY_CONFIG[currency].minorUnits === 0 ? 0 : 2;
  return { kind: "number", value: decimalString(amountMinor, currency), decimals };
}

// ---------------------------------------------------------------------------
// XML

/** Caracteres que XML 1.0 no admite ni escapados (control salvo \t \n \r). */
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Nombre de columna de Excel: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(index: number): string {
  let n = index;
  let result = "";
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/** Numero de serie de Excel para "yyyy-mm-dd" (dias desde 1899-12-30). */
export function excelSerial(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function cellXml(cell: XlsxCell, ref: string): string {
  switch (cell.kind) {
    case "text":
      return cell.value === null || cell.value === undefined || cell.value === ""
        ? ""
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    case "number":
      return `<c r="${ref}" s="${cell.decimals === 0 ? STYLE.integer : STYLE.decimal}"><v>${cell.value}</v></c>`;
    case "date":
      return `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(cell.value)}</v></c>`;
  }
}

function sheetXml(sheet: XlsxSheet): string {
  const lastCol = columnLetter(Math.max(0, sheet.columns.length - 1));
  const lastRow = sheet.rows.length + 1;
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`,
    )
    .join("");
  const header = sheet.columns
    .map(
      (c, i) =>
        `<c r="${columnLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${escapeXml(c.header)}</t></is></c>`,
    )
    .join("");
  const body = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 2}`))
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    "</worksheet>"
  );
}

const STYLES_XML =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

// ---------------------------------------------------------------------------
// ZIP (sin compresion)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Uint8Array };

/** Fecha/hora DOS fijas (1980-01-01 00:00): el archivo resulta identico en cada exportacion. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const header = (size: number) => {
    const bytes = new Uint8Array(size);
    return { bytes, view: new DataView(bytes.buffer) };
  };

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true); // version necesaria
    local.view.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.view.setUint16(8, 0, true); // metodo: store
    local.view.setUint16(10, DOS_TIME, true);
    local.view.setUint16(12, DOS_DATE, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, size, true);
    local.view.setUint32(22, size, true);
    local.view.setUint16(26, name.length, true);
    local.view.setUint16(28, 0, true);
    local.bytes.set(name, 30);
    chunks.push(local.bytes, entry.data);

    const dir = header(46 + name.length);
    dir.view.setUint32(0, 0x02014b50, true);
    dir.view.setUint16(4, 20, true); // version creadora
    dir.view.setUint16(6, 20, true);
    dir.view.setUint16(8, 0x0800, true);
    dir.view.setUint16(10, 0, true);
    dir.view.setUint16(12, DOS_TIME, true);
    dir.view.setUint16(14, DOS_DATE, true);
    dir.view.setUint32(16, crc, true);
    dir.view.setUint32(20, size, true);
    dir.view.setUint32(24, size, true);
    dir.view.setUint16(28, name.length, true);
    dir.view.setUint32(42, offset, true);
    dir.bytes.set(name, 46);
    central.push(dir.bytes);

    offset += local.bytes.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);

  const all = [...chunks, ...central, end.bytes];
  const out = new Uint8Array(all.reduce((sum, c) => sum + c.length, 0));
  let position = 0;
  for (const chunk of all) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

// ---------------------------------------------------------------------------

/** El nombre de una hoja admite hasta 31 caracteres y no puede llevar : \ / ? * [ ]. */
export function safeSheetName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Hoja1";
}

/** Arma el archivo .xlsx con una hoja. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const encoder = new TextEncoder();
  const file = (name: string, content: string): ZipEntry => ({
    name,
    data: encoder.encode(content),
  });

  return zipStore([
    file(
      "[Content_Types].xml",
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    ),
    file(
      "_rels/.rels",
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ),
    file(
      "xl/workbook.xml",
      XML_HEAD +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(safeSheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets>` +
        "</workbook>",
    ),
    file(
      "xl/_rels/workbook.xml.rels",
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>",
    ),
    file("xl/styles.xml", STYLES_XML),
    file("xl/worksheets/sheet1.xml", sheetXml(sheet)),
  ]);
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
