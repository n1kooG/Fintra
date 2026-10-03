"use client";

import { useState } from "react";
import { payCard } from "@/server/actions/cards";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fromMinorUnits, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

type Suggestion = { label: string; amountMinor: bigint };

/**
 * Pagar la tarjeta: una transferencia desde una cuenta propia a la cuenta de
 * la tarjeta. Con eso el saldo de ambas, el cupo y el estado de cuenta (que
 * pasa a «pagado») se ponen al dia.
 */
export function PayCardDialog({
  cardId,
  cardName,
  currency,
  accounts,
  suggestions,
}: {
  cardId: string;
  cardName: string;
  currency: Currency;
  /** Cuentas desde las que se puede pagar (no tarjetas). */
  accounts: { id: string; name: string; currency: Currency }[];
  /** Montos que ofrece el boton rapido: total del estado de cuenta, saldo de la tarjeta... */
  suggestions: Suggestion[];
}) {
  const first = suggestions[0];
  const [amount, setAmount] = useState(
    first ? String(fromMinorUnits(first.amountMinor, currency)) : "",
  );
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");

  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) => {
      formData.set("fromAccountId", fromAccountId);
      return payCard(cardId, { error: null }, formData);
    },
  );

  const source = accounts.find((a) => a.id === fromAccountId);
  const crossCurrency = source && source.currency !== currency;

  if (accounts.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          pagar tarjeta
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Pagar {cardName}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Se registra como una transferencia desde tu cuenta a la tarjeta: baja tu
            deuda, sube tu cupo y descuenta la plata de la cuenta.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Pagar desde</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className={labelClass}>
              Monto{source ? ` (${source.currency})` : ""}
            </Label>
            <Input
              id="pay-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() =>
                      setAmount(String(fromMinorUnits(s.amountMinor, currency)))
                    }
                    className="text-muted-foreground font-mono text-[10.5px] underline underline-offset-4"
                  >
                    {s.label}{" "}
                    <Amount
                      amountMinor={s.amountMinor}
                      currency={currency}
                      tone="neutral"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            {crossCurrency ? (
              <p className="text-muted-foreground font-mono text-[10.5px]">
                La cuenta y la tarjeta están en monedas distintas: se convierte con la
                cotización del día.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-date" className={labelClass}>
              Fecha
            </Label>
            <Input
              id="pay-date"
              name="occurredOn"
              type="date"
              defaultValue={todayISO()}
              className="font-mono"
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Registrando..." : "Registrar pago"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
