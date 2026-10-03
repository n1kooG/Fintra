import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contraste WCAG 2.x de los tokens de color de src/app/globals.css, en el
 * tema claro (:root) y en el oscuro (.dark). Si alguien cambia un color y
 * lo deja ilegible, esto falla antes de publicar.
 */

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf-8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Color de `fg` con opacidad `alpha` (0-1) sobre `bg`, como lo pinta el navegador. */
function blend(fg: string, bg: string, alpha: number): string {
  const mix = [1, 3, 5].map((i) => {
    const a = parseInt(fg.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(a * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${mix.join("")}`;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [primer plano, fondo, minimo, para que se usa]
const PAIRS: [string, string, number, string][] = [
  ["foreground", "background", 4.5, "texto principal"],
  ["foreground", "card", 4.5, "texto en tarjeta"],
  ["muted-foreground", "background", 4.5, "texto secundario y etiquetas"],
  ["muted-foreground", "card", 4.5, "texto secundario en tarjeta"],
  ["muted-foreground", "muted", 4.5, "texto secundario sobre muted"],
  ["income", "background", 4.5, "monto de ingreso"],
  ["expense", "background", 4.5, "monto de gasto"],
  ["transfer", "background", 4.5, "monto de transferencia"],
  ["destructive", "background", 4.5, "errores y acciones destructivas"],
  ["primary-foreground", "primary", 4.5, "texto de boton solido"],
  ["series-income", "background", 3, "barras de ingresos"],
  ["series-expense", "background", 3, "barras de gastos"],
  ["ring", "background", 3, "indicador de foco"],
  ["input", "background", 3, "borde de campos de formulario (WCAG 1.4.11)"],
  ["input", "card", 3, "borde de campos dentro de dialogos"],
];

describe.each([
  ["claro", ":root"],
  ["oscuro", ".dark"],
])("contraste del tema %s", (_name, selector) => {
  const t = tokens(selector);

  it.each(PAIRS)("%s sobre %s >= %s:1 (%s)", (fg, bg, minimum) => {
    expect(t[fg], `falta el token --${fg}`).toBeDefined();
    expect(t[bg], `falta el token --${bg}`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(minimum);
  });
});

describe.each([
  ["claro", ":root"],
  ["oscuro", ".dark"],
])("texto con opacidad en el tema %s", (_name, selector) => {
  const t = tokens(selector);

  // Pestanas inactivas (components/ui/tabs.tsx): text-foreground/70.
  it("foreground al 70% sobre el fondo >= 4.5:1", () => {
    expect(
      contrast(blend(t.foreground, t.background, 0.7), t.background),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
