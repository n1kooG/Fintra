"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "../actions";

const initialState: AuthState = { error: null };

export function RecuperarForm() {
  const [, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const [sent, setSent] = useState(false);

  return (
    <div className="w-full max-w-[360px]">
      <h1 className="mb-2 text-[22px] font-medium">Recuperar contraseña</h1>
      <p className="text-muted-foreground mb-9 font-mono text-[11.5px]">
        Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.
      </p>

      {sent ? (
        <p className="text-income font-mono text-[11px]">
          Si el correo está registrado, va a llegar un enlace en unos minutos.
        </p>
      ) : (
        <form
          action={formAction}
          onSubmit={() => setSent(true)}
          className="flex flex-col gap-6"
        >
          <div className="border-input space-y-1.5 border-b pb-2">
            <Label
              htmlFor="email"
              className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
            >
              Correo electrónico
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-auto border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 text-[12.5px]"
          >
            {pending ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>
      )}

      <p className="text-muted-foreground mt-8 text-center font-mono text-[11.5px]">
        <Link href="/login" className="border-foreground text-foreground border-b">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
