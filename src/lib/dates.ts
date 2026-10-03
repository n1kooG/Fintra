export const SANTIAGO_TZ = "America/Santiago";

/** Fecha de hoy en zona horaria de Chile, como "yyyy-mm-dd". */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SANTIAGO_TZ }).format(new Date());
}

/**
 * Formatea una fecha "yyyy-mm-dd" para el listado de movimientos:
 * "Hoy", "Ayer", o "10 de septiembre" (sin año si es el actual).
 */
export function formatRelativeDay(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return "Hoy";

  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: SANTIAGO_TZ }).format(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  if (dateISO === yesterday) return "Ayer";

  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const currentYear = new Date().getFullYear();

  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: year === currentYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Fecha corta para filas de tabla: "15 sep". */
export function formatShortDay(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

// --- Meses ("yyyy-mm") y diferencias de dias ---------------------------------

/** Mes de una fecha "yyyy-mm-dd" como "yyyy-mm". */
export function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** Valida y devuelve un mes "yyyy-mm", o null si no tiene ese formato. */
export function parseMonthKey(value: string | null | undefined): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** Primer y ultimo dia de un mes "yyyy-mm", como "yyyy-mm-dd". */
export function monthBounds(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Suma (o resta) meses a un mes "yyyy-mm". */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  const y = Math.floor(zeroBased / 12);
  const m = (zeroBased % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** "octubre de 2026" para un mes "yyyy-mm". */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Dias de calendario entre dos fechas "yyyy-mm-dd" (b - a; negativo si b es anterior). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
