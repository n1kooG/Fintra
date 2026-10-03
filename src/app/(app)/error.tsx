"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Frontera de error de las pantallas autenticadas: si una falla (una
 * consulta, un dato inesperado), el resto de la app sigue usable — la
 * barra lateral y el menu viven en el layout, fuera de esta frontera.
 * No se muestra el mensaje tecnico al usuario (ver RS-071).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El digest identifica el error en los logs del servidor sin exponer detalles.
    console.error("Error en la pantalla", error.digest ?? "");
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-xl font-medium">No pudimos cargar esta pantalla</h1>
      <p className="text-muted-foreground font-mono text-[12px]">
        Ocurrió un error inesperado. Tus datos están a salvo; puedes reintentar o volver
        al inicio.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-[10px]">
          código {error.digest}
        </p>
      ) : null}
      <div className="flex gap-5 font-mono text-[11px] uppercase">
        <button
          type="button"
          onClick={reset}
          className="border-foreground border-b pb-0.5"
        >
          reintentar
        </button>
        <Link href="/dashboard" className="text-muted-foreground">
          ir al inicio
        </Link>
      </div>
    </div>
  );
}
