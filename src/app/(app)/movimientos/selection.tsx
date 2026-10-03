"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  deleteTransactions,
  recategorizeTransactions,
  restoreDeleted,
} from "@/server/actions/transactions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SelectionContextValue = {
  active: boolean;
  setActive: (value: boolean) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Falta <SelectionProvider>.");
  return ctx;
}

/**
 * Seleccion de varios movimientos para actuar en lote (eliminar o cambiar de
 * categoria). Vive en el cliente; la lista sigue renderizandose en el servidor.
 */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const setActive = useCallback((value: boolean) => {
    setActiveState(value);
    if (!value) setSelected(new Set());
  }, []);

  const value = useMemo(
    () => ({ active, setActive, selected, toggle, clear }),
    [active, setActive, selected, toggle, clear],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Boton «seleccionar» / «cancelar» del encabezado. */
export function SelectionToggle() {
  const { active, setActive } = useSelection();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => setActive(!active)}
      className="text-muted-foreground font-mono text-[10.5px] uppercase underline underline-offset-4"
    >
      {active ? "cancelar selección" : "seleccionar"}
    </button>
  );
}

/** Casilla de una fila; solo aparece en modo seleccion. */
export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { active, selected, toggle } = useSelection();
  if (!active) return null;
  return (
    <input
      type="checkbox"
      aria-label={`Seleccionar ${label}`}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="accent-foreground size-4 shrink-0 self-center"
    />
  );
}

/** Barra con las acciones en lote; aparece al elegir al menos un movimiento. */
export function SelectionBar({
  categories,
}: {
  categories: { id: string; label: string; kind: "income" | "expense" }[];
}) {
  const { active, selected, clear, setActive } = useSelection();
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState<string>("");

  if (!active || selected.size === 0) return null;
  const ids = [...selected];

  function remove() {
    if (
      !confirm(
        `¿Eliminar ${ids.length} ${ids.length === 1 ? "movimiento" : "movimientos"}?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const snapshot = await deleteTransactions(ids);
        clear();
        setActive(false);
        toast(`${snapshot?.transactions.length ?? ids.length} movimientos eliminados`, {
          duration: 10_000,
          action: {
            label: "Deshacer",
            onClick: async () => {
              const result = await restoreDeleted(snapshot);
              if (result.error) toast.error(result.error);
              else toast.success("Movimientos restaurados.");
            },
          },
        });
      } catch {
        toast.error("No pudimos eliminar los movimientos.");
      }
    });
  }

  function recategorize() {
    if (!categoryId) return;
    startTransition(async () => {
      const result = await recategorizeTransactions(ids, categoryId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(
          result.updated === ids.length
            ? "Categoría actualizada."
            : `Categoría actualizada en ${result.updated} de ${ids.length} (las transferencias o de otro tipo no cambian).`,
        );
        clear();
        setCategoryId("");
      }
    });
  }

  return (
    <div
      role="region"
      aria-label="Acciones sobre la selección"
      className="border-border bg-background fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-6 py-3 md:bottom-0 md:left-[206px]"
    >
      <span className="font-mono text-[11px] uppercase">
        {ids.length} {ids.length === 1 ? "seleccionado" : "seleccionados"}
      </span>
      <span className="flex items-center gap-2">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger
            className="h-8 w-[200px] rounded-none text-[12px]"
            aria-label="Nueva categoría"
          >
            <SelectValue placeholder="Cambiar categoría a..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label} · {c.kind === "income" ? "ingreso" : "gasto"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          disabled={pending || !categoryId}
          onClick={recategorize}
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase disabled:opacity-40"
        >
          aplicar
        </button>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="text-destructive ml-auto font-mono text-[10.5px] uppercase disabled:opacity-40"
      >
        eliminar
      </button>
    </div>
  );
}
