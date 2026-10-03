"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/server/actions/accounts";

/**
 * Estado comun de un dialogo con formulario: se cierra al guardar sin
 * error y muestra el error del servidor si no. `run` recibe el FormData
 * y devuelve el resultado de la Server Action.
 */
export function useFormDialog(run: (formData: FormData) => Promise<ActionState>) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await run(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(null);
  }

  return { open, error, pending, handleSubmit, onOpenChange };
}
