"use client";

import { useState, useTransition } from "react";
import { syncRatesNow } from "@/server/actions/preferences";

export function SyncRatesButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncRatesNow();
            setMessage(
              result.error
                ? `No se pudo actualizar todo: ${result.error}`
                : `${result.saved} cotizaciones al día`,
            );
          })
        }
        className="text-muted-foreground font-mono text-[10.5px] uppercase disabled:opacity-50"
      >
        {pending ? "actualizando..." : "actualizar ahora"}
      </button>
      {message ? (
        <span className="text-muted-foreground font-mono text-[10px]">{message}</span>
      ) : null}
    </div>
  );
}
