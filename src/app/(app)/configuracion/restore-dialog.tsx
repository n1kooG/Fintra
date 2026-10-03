"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";
const CONFIRMATION = "REEMPLAZAR";

type RestoreResponse = {
  ok?: boolean;
  error?: string;
  counts?: Record<string, number>;
  dropped?: number;
};

/** Restaurar un respaldo JSON: REEMPLAZA todos los datos actuales del espacio. */
export function RestoreDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(null);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/import/respaldo", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as RestoreResponse;
        if (!response.ok || !result.ok) {
          setError(result.error ?? "No pudimos restaurar el respaldo.");
          return;
        }
        const rows = Object.values(result.counts ?? {}).reduce((a, b) => a + b, 0);
        toast.success(
          `Respaldo restaurado: ${rows} registros${
            result.dropped ? ` (${result.dropped} omitidos por estar incompletos)` : ""
          }.`,
        );
        setOpen(false);
        router.refresh();
      } catch {
        setError("No pudimos subir el archivo. Revisa tu conexión.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-border flex w-full items-baseline justify-between border-b py-3 text-left"
        >
          <span className="text-[14.5px]">Restaurar un respaldo</span>
          <span className="text-muted-foreground font-mono text-[12px]">subir ›</span>
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            Restaurar respaldo
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Esto <strong>reemplaza todos los datos actuales</strong> del espacio por los
            del archivo: cuentas, movimientos, presupuestos, todo. Los registros actuales
            se pierden.{" "}
            <a
              href="/api/export/respaldo"
              className="underline underline-offset-2"
              download
            >
              Descarga un respaldo de lo que tienes ahora
            </a>{" "}
            antes de seguir.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="restore-file" className={labelClass}>
              Archivo de respaldo (.json)
            </Label>
            <Input
              id="restore-file"
              name="file"
              type="file"
              accept="application/json,.json"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restore-confirmation" className={labelClass}>
              Escribe {CONFIRMATION} para confirmar
            </Label>
            <Input
              id="restore-confirmation"
              name="confirmation"
              autoComplete="off"
              required
              placeholder={CONFIRMATION}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="destructive"
            disabled={pending}
            className="w-full py-3 text-[12.5px]"
          >
            {pending ? "Restaurando..." : "Reemplazar mis datos"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
