"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteTransaction, restoreDeleted } from "@/server/actions/transactions";

/**
 * Elimina un movimiento y ofrece «Deshacer» durante unos segundos (el servidor
 * devuelve una copia de lo borrado). Visible siempre en pantallas tactiles y al
 * enfocarlo con teclado; en escritorio aparece al pasar el cursor por la fila.
 */
export function DeleteTransactionButton({ transactionId }: { transactionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar este movimiento?")) return;
        startTransition(async () => {
          try {
            const snapshot = await deleteTransaction(transactionId);
            toast("Movimiento eliminado", {
              duration: 10_000,
              action: {
                label: "Deshacer",
                onClick: async () => {
                  const result = await restoreDeleted(snapshot);
                  if (result.error) toast.error(result.error);
                  else toast.success("Movimiento restaurado.");
                },
              },
            });
          } catch {
            toast.error("No pudimos eliminar el movimiento.");
          }
        });
      }}
      className="text-muted-foreground font-mono text-[10px] uppercase transition-opacity focus-visible:opacity-100 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
    >
      eliminar
    </button>
  );
}
