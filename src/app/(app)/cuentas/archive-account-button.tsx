"use client";

import { useTransition } from "react";
import { archiveAccount } from "@/server/actions/accounts";

export function ArchiveAccountButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Archivar esta cuenta? Los movimientos que tenga se conservan."))
          return;
        startTransition(() => archiveAccount(accountId));
      }}
      className="text-muted-foreground font-mono text-[9.5px] uppercase transition-opacity focus-visible:opacity-100 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
    >
      archivar
    </button>
  );
}
