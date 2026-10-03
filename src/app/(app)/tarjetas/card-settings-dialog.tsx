"use client";

import { updateCardSettings } from "@/server/actions/cards";
import { useFormDialog } from "@/components/use-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fromMinorUnits, type Currency } from "@/lib/money";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/** Ciclo de facturacion (cierre y pago) y cupo de una tarjeta. */
export function CardSettingsDialog({
  accountId,
  name,
  currency,
  closeDay,
  dueDay,
  limitMinor,
  configured,
}: {
  accountId: string;
  name: string;
  currency: Currency;
  closeDay: number | null;
  dueDay: number | null;
  limitMinor: bigint | null;
  configured: boolean;
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    updateCardSettings(accountId, { error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {configured ? (
          <button
            type="button"
            className="text-muted-foreground font-mono text-[9.5px] uppercase"
          >
            editar ciclo y cupo
          </button>
        ) : (
          <Button>Configurar ciclo y cupo</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">{name}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cs-close" className={labelClass}>
                Día de cierre
              </Label>
              <Input
                id="cs-close"
                name="closeDay"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                required
                defaultValue={closeDay ?? undefined}
                placeholder="22"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-due" className={labelClass}>
                Día de pago
              </Label>
              <Input
                id="cs-due"
                name="dueDay"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                required
                defaultValue={dueDay ?? undefined}
                placeholder="5"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-limit" className={labelClass}>
              Cupo total ({currency}, opcional)
            </Label>
            <Input
              id="cs-limit"
              name="limit"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={
                limitMinor === null ? undefined : fromMinorUnits(limitMinor, currency)
              }
              className="font-mono"
            />
          </div>

          <p className="text-muted-foreground font-mono text-[10.5px]">
            Una compra hecha hasta el día de cierre (inclusive) entra a ese estado de
            cuenta, que vence en el primer día de pago posterior. Si cambias estos días,
            las cuotas ya agendadas conservan sus fechas.
          </p>

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
