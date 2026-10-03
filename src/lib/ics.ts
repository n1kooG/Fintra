/**
 * Exporta eventos del calendario financiero a iCalendar (.ics, RFC 5545) para
 * llevarlos a Google Calendar, Apple Calendar u Outlook. Logica pura.
 *
 * Todos son eventos de dia completo (DTSTART;VALUE=DATE, con DTEND al dia
 * siguiente porque el fin es exclusivo). Cada obligacion con monto
 * (vencimientos, cuotas, cargos) lleva un recordatorio a las 9:00 del dia
 * anterior. Los UID son estables: volver a importar el archivo actualiza los
 * eventos en vez de duplicarlos.
 */

import type { CalendarEvent, CalendarEventKind } from "./calendar";
import { formatMoney } from "./money";
import { addDays } from "./recurrence";

const KIND_PREFIX: Record<CalendarEventKind, string> = {
  income: "Ingreso",
  expense: "Pago",
  card_close: "Cierre de tarjeta",
  card_billing: "Vence tarjeta",
  loan: "Cuota",
  deposit_maturity: "Vence depósito",
};

/** Eventos de los que conviene que avise el calendario (no los ingresos ni el cierre). */
const ALERT_KINDS: ReadonlySet<CalendarEventKind> = new Set([
  "expense",
  "card_billing",
  "loan",
  "deposit_maturity",
]);

/** Escapa texto segun RFC 5545 (\\, ;, , y saltos de linea). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Dobla una linea a 75 octetos (RFC 5545 §3.1) sin partir caracteres multibyte. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // las continuaciones llevan un espacio al inicio
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** "2026-10-03" -> "20261003". */
function icsDate(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

/** Instante en UTC con formato iCalendar: "20261003T120000Z". */
function icsTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function uidFor(event: CalendarEvent): string {
  const safe = `${event.kind}-${event.id}-${event.date}`.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${safe}@fintra`;
}

function summaryFor(event: CalendarEvent): string {
  const base = `${KIND_PREFIX[event.kind]}: ${event.label}`;
  if (event.amountMinor === null) return base;
  const magnitude = event.amountMinor < 0n ? -event.amountMinor : event.amountMinor;
  return `${base} (${formatMoney(magnitude, event.currency)}${event.estimated ? ", estimado" : ""})`;
}

/** Arma el archivo .ics (con CRLF, como exige el estandar). */
export function buildIcs(
  events: CalendarEvent[],
  options: { calendarName?: string; now?: Date } = {},
): string {
  const stamp = icsTimestamp(options.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fintra//Calendario financiero//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName ?? "Fintra")}`,
    "X-WR-TIMEZONE:America/Santiago",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidFor(event)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeIcsText(summaryFor(event))}`,
      "TRANSP:TRANSPARENT",
    );
    if (ALERT_KINDS.has(event.kind)) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcsText(summaryFor(event))}`,
        "TRIGGER:-PT15H", // 9:00 del dia anterior (el evento parte a las 0:00)
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
