import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine } from "./ics";
import type { CalendarEvent } from "./calendar";

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "rule-1",
  date: "2026-10-05",
  kind: "expense",
  label: "Arriendo",
  amountMinor: -450_000n,
  currency: "CLP",
  estimated: false,
  ...over,
});

const NOW = new Date("2026-10-03T12:00:00Z");

describe("escapeIcsText", () => {
  it("escapa barra, punto y coma, coma y saltos de linea", () => {
    expect(escapeIcsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });
});

describe("foldIcsLine", () => {
  it("no toca lineas cortas", () => {
    expect(foldIcsLine("SUMMARY:corto")).toBe("SUMMARY:corto");
  });

  it("dobla a 75 octetos con continuacion de un espacio", () => {
    const folded = foldIcsLine(`SUMMARY:${"a".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    // al desplegar (quitar CRLF+espacio) se recupera el original
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"a".repeat(200)}`);
  });

  it("no parte caracteres multibyte", () => {
    const original = `SUMMARY:${"ñ".repeat(80)}`;
    const folded = foldIcsLine(original);
    expect(folded.replace(/\r\n /g, "")).toBe(original);
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("buildIcs", () => {
  it("arma un calendario valido con CRLF", () => {
    const ics = buildIcs([event()], { now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // ningun salto de linea suelto
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("DTSTAMP:20261003T120000Z");
  });

  it("evento de dia completo con fin exclusivo y UID estable", () => {
    const ics = buildIcs([event()], { now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261005");
    expect(ics).toContain("DTEND;VALUE=DATE:20261006");
    expect(ics).toContain("UID:expense-rule-1-2026-10-05@fintra");
    expect(buildIcs([event()], { now: new Date("2027-01-01T00:00:00Z") })).toContain(
      "UID:expense-rule-1-2026-10-05@fintra",
    );
  });

  it("el fin cruza de mes y de anio", () => {
    expect(buildIcs([event({ date: "2026-12-31" })], { now: NOW })).toContain(
      "DTEND;VALUE=DATE:20270101",
    );
  });

  it("resumen con tipo y monto (sin signo); estimado se avisa", () => {
    const ics = buildIcs(
      [
        event(),
        event({ id: "c1", kind: "card_billing", label: "Visa", estimated: true }),
      ],
      { now: NOW },
    );
    expect(ics).toMatch(/SUMMARY:Pago: Arriendo \(\$450\.000\)/);
    expect(ics).toMatch(/SUMMARY:Vence tarjeta: Visa \(\$450\.000\\, estimado\)/);
  });

  it("recordatorio solo en obligaciones, no en ingresos ni cierres", () => {
    const withAlarm = buildIcs([event({ kind: "loan" })], { now: NOW });
    expect(withAlarm).toContain("BEGIN:VALARM");
    expect(withAlarm).toContain("TRIGGER:-PT15H");
    for (const kind of ["income", "card_close"] as const) {
      expect(buildIcs([event({ kind, amountMinor: null })], { now: NOW })).not.toContain(
        "VALARM",
      );
    }
  });

  it("eventos sin monto no muestran parentesis", () => {
    const ics = buildIcs(
      [event({ kind: "card_close", label: "Visa", amountMinor: null })],
      {
        now: NOW,
      },
    );
    expect(ics).toContain("SUMMARY:Cierre de tarjeta: Visa\r\n");
  });

  it("sanea el UID y escapa el texto del titulo", () => {
    const ics = buildIcs([event({ id: "a b/c", label: "Luz; agua, gas" })], { now: NOW });
    expect(ics).toContain("UID:expense-a-b-c-2026-10-05@fintra");
    expect(ics).toContain("Luz\\; agua\\, gas");
  });

  it("sin eventos igual es un calendario valido", () => {
    const ics = buildIcs([], { now: NOW });
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });
});
