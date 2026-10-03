"use client";

import { useState } from "react";
import { reconcileAccount } from "@/server/actions/accounts";
import { useFormDialog } from "@/components/use-form-dialog";
import { Amount } from "@/components/money/amount";
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
import { fromMinorUnits, toMinorUnits, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/**
 * Conciliar una cuenta: se escribe el saldo que dice el banco y, si difiere del
 * que lleva Fintra, se crea un movimiento de ajuste por la diferencia (ingreso
 * si falta plata en Fintra, gasto si sobra), para que ambos coincidan.
 */
export function ReconcileDialog({
  accountId,
  name,
  currency,
  balanceMinor,
}: {
  accountId: string;
  name: string;
  currency: Currency;
  balanceMinor: bigint;
}) {
  const [actual, setActual] = useState("");
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    reconcileAccount(accountId, { error: null }, formData),
  );

  const value = actual.trim() === "" ? null : Number(actual);
  const diffMinor =
    value !== null && Number.isFinite(value)
      ? toMinorUnits(value, currency) - balanceMinor
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground font-mono text-[9.5px] uppercase transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          conciliar
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Conciliar {name}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Compara con tu banco: escribe el saldo que ves allá y ajustamos la diferencia
            con un movimiento.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <p className="text-muted-foreground font-mono text-[11.5px]">
            Fintra tiene{" "}
            <Amount
              amountMinor={balanceMinor}
              currency={currency}
              withSymbol
              tone="neutral"
            />{" "}
            (hoy)
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="rc-actual" className={labelClass}>
              Saldo según el banco ({currency})
            </Label>
            <Input
              id="rc-actual"
              name="actual"
              type="number"
              inputMode="decimal"
              step="any"
              required
              autoFocus
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="font-mono"
              placeholder={String(fromMinorUnits(balanceMinor, currency))}
            />
            <p className="text-muted-foreground font-mono text-[10.5px]">
              En una tarjeta de crédito, la deuda va con signo menos (por ejemplo
              -150000).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rc-date" className={labelClass}>
              Fecha del ajuste
            </Label>
            <Input
              id="rc-date"
              name="occurredOn"
              type="date"
              defaultValue={todayISO()}
              className="font-mono"
            />
          </div>

          {diffMinor !== null ? (
            <p
              role="status"
              className="border-border border-l-2 pl-3 font-mono text-[11.5px]"
            >
              {diffMinor === 0n ? (
                "Ya coinciden: no hace falta ajustar nada."
              ) : (
                <>
                  Se creará un {diffMinor > 0n ? "ingreso" : "gasto"} de ajuste por{" "}
                  <Amount
                    amountMinor={diffMinor > 0n ? diffMinor : -diffMinor}
                    currency={currency}
                    withSymbol
                    tone={diffMinor > 0n ? "income" : "expense"}
                  />
                  . Antes de ajustar, revisa si falta registrar algún movimiento.
                </>
              )}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending || diffMinor === 0n}
            className="w-full py-3 text-[12.5px]"
          >
            {pending ? "Ajustando..." : "Crear ajuste"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
