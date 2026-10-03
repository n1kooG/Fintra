import { describe, expect, it } from "vitest";
import {
  CHORD_TIMEOUT_MS,
  GO_TO,
  INITIAL_SHORTCUT_STATE,
  handleShortcutKey,
  type KeyContext,
} from "./shortcuts";

const ctx = (overrides: Partial<KeyContext> = {}): KeyContext => ({
  now: 1000,
  typing: false,
  modified: false,
  enabled: true,
  ...overrides,
});

describe("handleShortcutKey", () => {
  it("n abre un movimiento nuevo", () => {
    expect(handleShortcutKey(INITIAL_SHORTCUT_STATE, "n", ctx()).action).toEqual({
      type: "navigate",
      href: "/movimientos/nuevo",
    });
  });

  it("? abre la paleta", () => {
    expect(handleShortcutKey(INITIAL_SHORTCUT_STATE, "?", ctx()).action).toEqual({
      type: "palette",
    });
  });

  it("g seguido de una letra navega", () => {
    const first = handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx({ now: 1000 }));
    expect(first.action).toBeNull();
    expect(first.state.pendingSince).toBe(1000);

    const second = handleShortcutKey(first.state, "d", ctx({ now: 1500 }));
    expect(second.action).toEqual({ type: "navigate", href: "/dashboard" });
    expect(second.state.pendingSince).toBeNull();
  });

  it("g seguido de una letra desconocida no hace nada y limpia el prefijo", () => {
    const first = handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx());
    const second = handleShortcutKey(first.state, "z", ctx({ now: 1100 }));
    expect(second).toEqual({ state: { pendingSince: null }, action: null });
  });

  it("el prefijo g caduca", () => {
    const first = handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx({ now: 1000 }));
    const late = handleShortcutKey(
      first.state,
      "d",
      ctx({ now: 1000 + CHORD_TIMEOUT_MS + 1 }),
    );
    // Pasado el plazo, "d" ya no es destino; no es atajo suelto, asi que no hace nada.
    expect(late.action).toBeNull();
  });

  it("tras caducar, una n vuelve a funcionar como atajo suelto", () => {
    const first = handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx({ now: 1000 }));
    const late = handleShortcutKey(
      first.state,
      "n",
      ctx({ now: 1000 + CHORD_TIMEOUT_MS + 1 }),
    );
    expect(late.action).toEqual({ type: "navigate", href: "/movimientos/nuevo" });
  });

  it("no se activa mientras se escribe", () => {
    expect(
      handleShortcutKey(INITIAL_SHORTCUT_STATE, "n", ctx({ typing: true })).action,
    ).toBeNull();
    const pending = handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx());
    expect(handleShortcutKey(pending.state, "d", ctx({ typing: true }))).toEqual({
      state: { pendingSince: null },
      action: null,
    });
  });

  it("no se activa con Ctrl, Cmd o Alt (son del navegador)", () => {
    expect(
      handleShortcutKey(INITIAL_SHORTCUT_STATE, "n", ctx({ modified: true })).action,
    ).toBeNull();
  });

  it("desactivados, no hacen nada", () => {
    expect(
      handleShortcutKey(INITIAL_SHORTCUT_STATE, "n", ctx({ enabled: false })).action,
    ).toBeNull();
    expect(
      handleShortcutKey(INITIAL_SHORTCUT_STATE, "g", ctx({ enabled: false })).state,
    ).toEqual({
      pendingSince: null,
    });
  });

  it("las mayusculas funcionan igual (Caps Lock)", () => {
    expect(handleShortcutKey(INITIAL_SHORTCUT_STATE, "N", ctx()).action).toEqual({
      type: "navigate",
      href: "/movimientos/nuevo",
    });
  });

  it("cada destino de g apunta a una ruta distinta", () => {
    const hrefs = Object.values(GO_TO).map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
