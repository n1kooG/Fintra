"use client";

import { useTransition } from "react";
import {
  deleteHolding,
  deleteHoldingFlow,
  deleteHoldingValuation,
  setHoldingArchived,
} from "@/server/actions/investments";

const buttonClass =
  "text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50";

export function ArchiveHoldingButton({
  holdingId,
  archived,
}: {
  holdingId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !archived &&
          !confirm(
            "¿Archivar este instrumento? Deja de sumar a tu patrimonio, pero conserva su historia.",
          )
        )
          return;
        startTransition(() => setHoldingArchived(holdingId, !archived));
      }}
      className={buttonClass}
    >
      {archived ? "reabrir" : "archivar"}
    </button>
  );
}

export function DeleteHoldingButton({
  holdingId,
  name,
}: {
  holdingId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar "${name}" con todos sus aportes y valorizaciones?`))
          return;
        startTransition(() => deleteHolding(holdingId));
      }}
      className={buttonClass}
    >
      eliminar
    </button>
  );
}

export function DeleteFlowButton({ flowId }: { flowId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar este movimiento del instrumento?")) return;
        startTransition(() => deleteHoldingFlow(flowId));
      }}
      className={buttonClass}
    >
      quitar
    </button>
  );
}

export function DeleteValuationButton({ valuationId }: { valuationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar esta valorización?")) return;
        startTransition(() => deleteHoldingValuation(valuationId));
      }}
      className={buttonClass}
    >
      quitar
    </button>
  );
}
