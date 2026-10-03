"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/server/actions/household";
import { Button } from "@/components/ui/button";

/** Boton de aceptar: el token viaja ligado a la accion, no en un campo del formulario. */
export function AcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite.bind(null, token), {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="text-destructive font-mono text-[11.5px]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full py-3.5 text-[12.5px]">
        {pending ? "Uniéndote..." : "Unirme al espacio"}
      </Button>
    </form>
  );
}
