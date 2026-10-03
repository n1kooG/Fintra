"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { usePrivacy } from "@/components/privacy/privacy-provider";
import { NAV_ITEMS } from "@/components/nav/nav-items";
import {
  GO_TO,
  INITIAL_SHORTCUT_STATE,
  handleShortcutKey,
  type ShortcutState,
} from "@/lib/shortcuts";

const OPEN_EVENT = "fintra:open-palette";
const SHORTCUTS_KEY = "fintra:shortcuts";
const SHORTCUTS_EVENT = "fintra:shortcuts-change";

// --- Preferencia "atajos de una tecla" (activados por defecto) ---------------

function readShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribeShortcuts(callback: () => void) {
  window.addEventListener(SHORTCUTS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SHORTCUTS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function setShortcutsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SHORTCUTS_KEY, enabled ? "on" : "off");
  } catch {
    // Sin localStorage la preferencia solo dura mientras no se recargue.
  }
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribeShortcuts, readShortcutsEnabled, () => true);
}

/** Descarga un archivo del servidor sin navegar (un <a> temporal; la respuesta trae Content-Disposition). */
function download(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}

/** El foco esta en algo donde escribir o elegir: ahi las letras no son atajos. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest('[role="dialog"], [role="combobox"], [role="listbox"]') !== null
  );
}

/** Boton que abre la paleta desde cualquier parte (barra lateral, menu "Mas"). */
export function OpenPaletteButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={className}
    >
      buscar · ctrl k
    </button>
  );
}

const SHORTCUT_BY_HREF = new Map(
  Object.entries(GO_TO).map(([key, t]) => [t.href, `g ${key}`]),
);

const EXTRA_PAGES = [
  { href: "/reportes/proyeccion", label: "Reportes · Proyección de caja" },
  { href: "/reportes/suscripciones", label: "Reportes · Suscripciones y gasto hormiga" },
  { href: "/configuracion", label: "Configuración" },
  { href: "/configuracion/reglas", label: "Reglas de auto-categorización" },
];

/**
 * Paleta de comandos (Ctrl/Cmd+K) y atajos de teclado: ir a cualquier
 * pantalla o ejecutar una accion sin tocar el mouse. Los atajos de una
 * tecla (n, g + letra, ?) se pueden desactivar desde la propia paleta.
 */
export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const shortcutsEnabled = useShortcutsEnabled();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let state: ShortcutState = INITIAL_SHORTCUT_STATE;

    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.defaultPrevented || event.repeat) return;

      const result = handleShortcutKey(state, event.key, {
        now: event.timeStamp,
        typing: isTyping(event.target),
        modified: event.ctrlKey || event.metaKey || event.altKey,
        enabled: shortcutsEnabled,
      });
      state = result.state;

      if (result.action?.type === "navigate") router.push(result.action.href);
      else if (result.action?.type === "palette") setOpen(true);
    }

    function onOpenRequest() {
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenRequest);
    };
  }, [router, shortcutsEnabled]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const pages = [
    ...NAV_ITEMS.map((item) => ({ href: item.href, label: item.label })),
    ...EXTRA_PAGES,
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Paleta de comandos"
      description="Busca una pantalla o una acción"
    >
      <CommandInput placeholder="Ir a una pantalla o ejecutar una acción..." />
      <CommandList>
        <CommandEmpty>Sin resultados</CommandEmpty>

        <CommandGroup heading="Acciones">
          <CommandItem onSelect={() => run(() => router.push("/movimientos/nuevo"))}>
            Nuevo movimiento
            {shortcutsEnabled ? <CommandShortcut>n</CommandShortcut> : null}
          </CommandItem>
          <CommandItem onSelect={() => run(toggle)}>
            {hidden ? "Mostrar montos" : "Ocultar montos"}
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            Tema oscuro
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            Tema claro
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            Tema del sistema
          </CommandItem>
          <CommandItem onSelect={() => run(() => download("/api/export/respaldo"))}>
            Descargar respaldo (JSON)
          </CommandItem>
          <CommandItem onSelect={() => run(() => download("/api/export/movimientos"))}>
            Exportar movimientos (CSV)
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => download("/api/export/movimientos?formato=xlsx"))}
          >
            Exportar movimientos (Excel)
          </CommandItem>
          <CommandItem onSelect={() => run(() => setShortcutsEnabled(!shortcutsEnabled))}>
            {shortcutsEnabled
              ? "Desactivar atajos de una tecla"
              : "Activar atajos de una tecla (n, g + letra, ?)"}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Ir a">
          {pages.map((page) => (
            <CommandItem
              key={page.href}
              onSelect={() => run(() => router.push(page.href))}
            >
              {page.label}
              {shortcutsEnabled && SHORTCUT_BY_HREF.has(page.href) ? (
                <CommandShortcut>{SHORTCUT_BY_HREF.get(page.href)}</CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
