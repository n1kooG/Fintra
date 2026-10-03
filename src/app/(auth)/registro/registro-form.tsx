"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpWithPassword, signInWithGoogle, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = { error: null };

export function RegistroForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signUpWithPassword, initialState);

  return (
    <div className="w-full max-w-[360px]">
      <h1 className="mb-2 text-[22px] font-medium">Crear cuenta</h1>
      <p className="text-muted-foreground mb-9 font-mono text-[11.5px]">
        Un espacio personal, listo en un minuto
      </p>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="next" value={next} />
        <div className="border-input space-y-1.5 border-b pb-2">
          <Label
            htmlFor="fullName"
            className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
          >
            Nombre
          </Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            className="h-auto border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
          />
        </div>

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

        <div className="border-input space-y-1.5 border-b pb-2">
          <Label
            htmlFor="password"
            className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
          >
            Contraseña
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="h-auto border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
          />
        </div>

        {state.error ? (
          <p className="text-destructive font-mono text-[11px]">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full py-3.5 text-[12.5px]">
          {pending ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3.5">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase">
          o continuar con
        </span>
        <div className="bg-border h-px flex-1" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="outline"
          className="border-border text-muted-foreground w-full py-3 font-mono text-[12px]"
        >
          Google
        </Button>
      </form>

      <p className="text-muted-foreground mt-8 text-center font-mono text-[11.5px]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={
            next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`
          }
          className="border-foreground text-foreground border-b"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
