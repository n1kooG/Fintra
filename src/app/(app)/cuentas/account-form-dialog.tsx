"use client";

import { useState, useTransition } from "react";
import { createAccount, type ActionState } from "@/server/actions/accounts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, type Currency } from "@/lib/money";

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "checking", label: "Cuenta corriente" },
  { value: "cash", label: "Efectivo" },
  { value: "savings", label: "Ahorro" },
  { value: "credit_card", label: "Tarjeta de crédito" },
  { value: "investment", label: "Inversión" },
  { value: "loan", label: "Préstamo" },
];

const CURRENCY_LABELS: Record<Currency, string> = {
  CLP: "Pesos chilenos (CLP)",
  USD: "Dólares (USD)",
  EUR: "Euros (EUR)",
  UF: "Unidad de Fomento (UF)",
  UTM: "UTM",
};

const initialState: ActionState = { error: null };

export function AccountFormDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("checking");
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createAccount(initialState, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>+ Agregar cuenta</Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Nueva cuenta</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="name"
              className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
            >
              Nombre
            </Label>
            <Input id="name" name="name" required placeholder="Cuenta RUT" />
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[9.5px] tracking-[0.08em] uppercase">
              Tipo
            </Label>
            <Select name="type" value={type} onValueChange={setType} required>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[9.5px] tracking-[0.08em] uppercase">
              Moneda
            </Label>
            <Select name="currency" defaultValue="CLP" required>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="institution"
              className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
            >
              Institución (opcional)
            </Label>
            <Input id="institution" name="institution" placeholder="BancoEstado" />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="initialBalance"
              className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
            >
              Saldo inicial
            </Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              type="number"
              step="any"
              defaultValue={0}
              className="font-mono"
            />
          </div>

          {type === "credit_card" ? (
            <div className="border-border flex flex-col gap-4 border-t pt-4">
              <p className="text-muted-foreground font-mono text-[10.5px]">
                Opcional: con el ciclo de facturación puedes pagar en cuotas y ver los
                estados de cuenta. Lo puedes completar después en Tarjetas.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="closeDay"
                    className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
                  >
                    Día de cierre
                  </Label>
                  <Input
                    id="closeDay"
                    name="closeDay"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    placeholder="22"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="dueDay"
                    className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
                  >
                    Día de pago
                  </Label>
                  <Input
                    id="dueDay"
                    name="dueDay"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    placeholder="5"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="limit"
                  className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
                >
                  Cupo total
                </Label>
                <Input
                  id="limit"
                  name="limit"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="font-mono"
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar cuenta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
