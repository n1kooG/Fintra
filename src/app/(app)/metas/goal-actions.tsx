"use client";

import { useTransition } from "react";
import { deleteContribution, deleteGoal } from "@/server/actions/goals";

export function DeleteGoalButton({ goalId, name }: { goalId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar la meta "${name}" y todos sus aportes?`)) return;
        startTransition(() => deleteGoal(goalId));
      }}
      className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
    >
      eliminar
    </button>
  );
}

export function DeleteContributionButton({ contributionId }: { contributionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar este aporte?")) return;
        startTransition(() => deleteContribution(contributionId));
      }}
      className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50"
    >
      quitar
    </button>
  );
}
