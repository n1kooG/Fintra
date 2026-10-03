"use client";

import { useTransition } from "react";
import { deleteLoan, deleteLoanPrepayment } from "@/server/actions/loans";
import { deletePersonalDebt, setPersonalDebtSettled } from "@/server/actions/debts";
import { toast } from "sonner";
import { deleteTransaction, restoreDeleted } from "@/server/actions/transactions";

const buttonClass =
  "text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50";

export function DeleteLoanButton({ loanId, name }: { loanId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `¿Eliminar el préstamo "${name}"? Se quita de tu patrimonio y del calendario.`,
          )
        )
          return;
        startTransition(() => deleteLoan(loanId));
      }}
      className={buttonClass}
    >
      eliminar
    </button>
  );
}

export function DeletePrepaymentButton({ prepaymentId }: { prepaymentId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "¿Eliminar este abono? La tabla de amortización vuelve a calcularse sin él (el gasto de la cuenta, si lo descontaste, queda en Movimientos).",
          )
        )
          return;
        startTransition(() => deleteLoanPrepayment(prepaymentId));
      }}
      className={buttonClass}
    >
      quitar
    </button>
  );
}

export function SettleDebtButton({
  debtId,
  settled,
}: {
  debtId: string;
  settled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setPersonalDebtSettled(debtId, !settled))}
      className={buttonClass}
    >
      {settled ? "reabrir" : "marcar saldada"}
    </button>
  );
}

export function DeleteDebtButton({ debtId, person }: { debtId: string; person: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar la deuda con ${person}?`)) return;
        startTransition(() => deletePersonalDebt(debtId));
      }}
      className={buttonClass}
    >
      eliminar
    </button>
  );
}

/** Eliminar una compra en cuotas = eliminar su movimiento (el plan se borra en cascada). */
export function DeletePlanPurchaseButton({
  transactionId,
  name,
}: {
  transactionId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `¿Eliminar la compra "${name}"? Se borra el movimiento y todas sus cuotas, y el saldo de la tarjeta se recalcula.`,
          )
        )
          return;
        startTransition(async () => {
          try {
            const snapshot = await deleteTransaction(transactionId);
            toast("Compra eliminada", {
              duration: 10_000,
              action: {
                label: "Deshacer",
                onClick: async () => {
                  const result = await restoreDeleted(snapshot);
                  if (result.error) toast.error(result.error);
                  else toast.success("Compra restaurada con sus cuotas.");
                },
              },
            });
          } catch {
            toast.error("No pudimos eliminar la compra.");
          }
        });
      }}
      className={buttonClass}
    >
      eliminar compra
    </button>
  );
}
