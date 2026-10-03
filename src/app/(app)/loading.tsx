import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto mientras carga una pantalla autenticada: reserva el espacio
 * del encabezado y de las primeras filas, para que el contenido no salte
 * al llegar. Respeta prefers-reduced-motion (sin pulso).
 */
export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11"
      role="status"
      aria-label="Cargando"
    >
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-48 rounded-none motion-reduce:animate-none" />
        <Skeleton className="h-8 w-32 rounded-none motion-reduce:animate-none" />
      </div>
      <Skeleton className="h-20 w-full rounded-none motion-reduce:animate-none" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-10 w-full rounded-none motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
