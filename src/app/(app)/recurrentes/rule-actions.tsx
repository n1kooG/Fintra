"use client";

import { useTransition } from "react";
import { deleteRecurringRule, setRecurringRuleActive } from "@/server/actions/recurring";

export function RuleActions({
  ruleId,
  active,
  canResume,
}: {
  ruleId: string;
  active: boolean;
  /** false si la regla ya paso su fecha de termino: no hay nada que reanudar. */
  canResume: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      {active || canResume ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setRecurringRuleActive(ruleId, !active))}
          className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
        >
          {active ? "pausar" : "reanudar"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "¿Eliminar esta regla? Los movimientos que ya generó se conservan; solo deja de crear nuevos.",
            )
          )
            return;
          startTransition(() => deleteRecurringRule(ruleId));
        }}
        className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
      >
        eliminar
      </button>
    </>
  );
}
