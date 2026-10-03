"use client";

import { saveTotalBudget } from "@/server/actions/budgets";
import { useFormDialog } from "@/components/use-form-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISPLAY_CURRENCIES, fromMinorUnits, type Currency } from "@/lib/money";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/**
 * Tope TOTAL de gasto del mes: un solo limite para todo lo que gastas, con o
 * sin presupuesto por categoria. Si existe, el «disponible por día» se calcula
 * contra él.
 */
export function TotalBudgetDialog({
  monthKey,
  display,
  current,
}: {
  monthKey: string;
  display: Currency;
  /** El tope actual en su moneda, si ya hay uno (para editarlo). */
  current?: { amountMinor: bigint; currency: Currency };
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    saveTotalBudget(monthKey, { error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          {current ? "cambiar tope total" : "definir tope total"}
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            Tope total del mes
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Cuánto quieres gastar en total este mes, en todas las categorías. Cuenta todo
            lo que gastas, tenga o no un presupuesto propio.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-amount" className={labelClass}>
                Tope del mes
              </Label>
              <Input
                id="tb-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                autoFocus
                defaultValue={
                  current
                    ? fromMinorUnits(current.amountMinor, current.currency)
                    : undefined
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Moneda</Label>
              <Select name="currency" defaultValue={current?.currency ?? display}>
                <SelectTrigger className="w-[88px] rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar tope"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
