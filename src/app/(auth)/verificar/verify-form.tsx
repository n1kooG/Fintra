"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "../actions";
import { signOut } from "../actions";
import { verifyMfaLogin } from "./actions";

const initialState: AuthState = { error: null };

export function VerifyForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(verifyMfaLogin, initialState);

  return (
    <div className="w-full max-w-[360px]">
      <h1 className="mb-2 text-[22px] font-medium">Verificación en dos pasos</h1>
      <p className="text-muted-foreground mb-9 font-mono text-[11.5px]">
        Abre tu aplicación de autenticación y escribe el código de 6 dígitos de Fintra.
      </p>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="next" value={next} />

        <div className="border-input space-y-1.5 border-b pb-2">
          <Label
            htmlFor="code"
            className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
          >
            Código
          </Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            className="h-auto border-0 bg-transparent p-0 font-mono text-[22px] tracking-[0.3em] shadow-none focus-visible:ring-0"
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-destructive font-mono text-[11px]">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full py-3.5 text-[12.5px]">
          {pending ? "Verificando..." : "Verificar"}
        </Button>
      </form>

      <form action={signOut} className="mt-8 text-center">
        <button
          type="submit"
          className="text-muted-foreground font-mono text-[10.5px] uppercase"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
