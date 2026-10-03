"use client";

import { useState, useTransition } from "react";
import {
  copyBudgetsFromPreviousMonth,
  deleteBudget,
  deleteTotalBudget,
} from "@/server/actions/budgets";

export function DeleteBudgetButton({
  budgetId,
  name,
}: {
  budgetId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Quitar el presupuesto de "${name}" en este mes?`)) return;
        startTransition(() => deleteBudget(budgetId));
      }}
      className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
    >
      quitar
    </button>
  );
}

export function DeleteTotalBudgetButton({ totalId }: { totalId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Quitar el tope total de este mes?")) return;
        startTransition(() => deleteTotalBudget(totalId));
      }}
      className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
    >
      quitar tope
    </button>
  );
}

/** Copia los presupuestos del mes anterior (solo agrega las categorias que faltan). */
export function CopyBudgetsButton({
  monthKey,
  label,
}: {
  monthKey: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await copyBudgetsFromPreviousMonth(monthKey);
            setMessage(
              result.error ??
                (result.copied === 0
                  ? "Ya tenías todos esos presupuestos en este mes."
                  : `${result.copied} ${result.copied === 1 ? "presupuesto copiado" : "presupuestos copiados"}.`),
            );
          })
        }
        className="border-foreground self-start border-b pb-1 font-mono text-[10.5px] uppercase disabled:opacity-50"
      >
        {pending ? "copiando..." : label}
      </button>
      {message ? (
        <span className="text-muted-foreground font-mono text-[10.5px]">{message}</span>
      ) : null}
    </div>
  );
}
