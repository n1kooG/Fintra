/**
 * Atajos de teclado de una sola tecla, como maquina de estados pura (sin
 * tocar el DOM, asi se prueba sin navegador):
 *
 *   n         nuevo movimiento
 *   g y letra ir a una pantalla (g d = dashboard, g m = movimientos...)
 *   ?         abrir la paleta de comandos
 *
 * Nunca se activan mientras se escribe en un campo ni con Ctrl/Cmd/Alt
 * (eso es del navegador y de la paleta, que usa Ctrl/Cmd+K). El prefijo
 * "g" caduca al cabo de un instante, para no dejar un estado colgado.
 *
 * Los atajos de una tecla se pueden desactivar (WCAG 2.1.4): quien usa
 * reconocimiento de voz o teclado adaptado puede pulsarlos sin querer.
 */

export const CHORD_TIMEOUT_MS = 1200;

/** Destino de cada "g + letra". */
export const GO_TO: Record<string, { href: string; label: string }> = {
  d: { href: "/dashboard", label: "Dashboard" },
  m: { href: "/movimientos", label: "Movimientos" },
  c: { href: "/cuentas", label: "Cuentas" },
  r: { href: "/recurrentes", label: "Recurrentes" },
  p: { href: "/presupuestos", label: "Presupuestos" },
  e: { href: "/metas", label: "Metas" },
  t: { href: "/tarjetas", label: "Tarjetas" },
  i: { href: "/inversiones", label: "Inversiones" },
  f: { href: "/reportes", label: "Reportes" },
  k: { href: "/calendario", label: "Calendario" },
  s: { href: "/configuracion", label: "Configuración" },
};

export type ShortcutAction = { type: "navigate"; href: string } | { type: "palette" };

export type ShortcutState = { pendingSince: number | null };

export const INITIAL_SHORTCUT_STATE: ShortcutState = { pendingSince: null };

export type KeyContext = {
  /** Milisegundos (Date.now / event.timeStamp), para caducar el prefijo "g". */
  now: number;
  /** El foco esta en un campo de texto, selector o similar. */
  typing: boolean;
  /** Ctrl, Cmd o Alt estan apretados. */
  modified: boolean;
  /** Los atajos de una tecla estan activados. */
  enabled: boolean;
};

export function handleShortcutKey(
  state: ShortcutState,
  key: string,
  context: KeyContext,
): { state: ShortcutState; action: ShortcutAction | null } {
  const reset = { pendingSince: null };
  if (!context.enabled || context.typing || context.modified) {
    return { state: reset, action: null };
  }

  const lower = key.toLowerCase();
  const pending =
    state.pendingSince !== null && context.now - state.pendingSince <= CHORD_TIMEOUT_MS;

  if (pending) {
    const target = GO_TO[lower];
    return target
      ? { state: reset, action: { type: "navigate", href: target.href } }
      : { state: reset, action: null };
  }

  if (lower === "g") return { state: { pendingSince: context.now }, action: null };
  if (lower === "n") {
    return { state: reset, action: { type: "navigate", href: "/movimientos/nuevo" } };
  }
  if (key === "?") return { state: reset, action: { type: "palette" } };
  return { state: reset, action: null };
}
