const format = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Porcentaje con signo explicito: +8,4% / −5,1% / 0,0%. El signo va
 * impreso (menos tipografico), asi el significado no depende del color.
 * null (no hay base de comparacion) se muestra como "—".
 */
export function signedPercent(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "0,0%";
  return `${value > 0 ? "+" : "−"}${format.format(Math.abs(value))}%`;
}
