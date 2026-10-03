"use client";

import { createLoan, updateLoan } from "@/server/actions/loans";
import { createPersonalDebt } from "@/server/actions/debts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

function CurrencyField({ id }: { id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClass}>
        Moneda
      </Label>
      <Select name="currency" defaultValue="CLP">
        <SelectTrigger id={id} className="w-[88px] rounded-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export type EditingLoan = {
  id: string;
  name: string;
  lender: string | null;
  currency: string;
  principal: number;
  installment: number;
  count: number;
  firstDueDate: string;
};

/** Prestamo formal: lo que dice el contrato. La tasa y la tabla se calculan. Con `loan`, edita. */
export function LoanDialog({ loan }: { loan?: EditingLoan }) {
  const editing = Boolean(loan);
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) =>
      loan
        ? updateLoan(loan.id, { error: null }, formData)
        : createLoan({ error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <button
            type="button"
            className="text-muted-foreground font-mono text-[9.5px] uppercase"
          >
            editar
          </button>
        ) : (
          <Button>+ Préstamo</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background max-h-[90dvh] overflow-y-auto rounded-none sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            {editing ? "Editar préstamo" : "Nuevo préstamo"}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-name" className={labelClass}>
                Nombre
              </Label>
              <Input
                id="loan-name"
                name="name"
                required
                maxLength={80}
                placeholder="Préstamo auto"
                defaultValue={loan?.name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-lender" className={labelClass}>
                Institución
              </Label>
              <Input
                id="loan-lender"
                name="lender"
                maxLength={80}
                placeholder="opcional"
                defaultValue={loan?.lender ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-principal" className={labelClass}>
                Monto del préstamo
              </Label>
              <Input
                id="loan-principal"
                name="principal"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                defaultValue={loan?.principal}
                className="font-mono"
              />
            </div>
            {loan ? (
              <div className="space-y-1.5">
                <Label className={labelClass}>Moneda</Label>
                <div className="border-border flex h-9 w-[88px] items-center border px-3 font-mono text-[13px]">
                  {loan.currency}
                </div>
              </div>
            ) : (
              <CurrencyField id="loan-currency" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-count" className={labelClass}>
                N° de cuotas
              </Label>
              <Input
                id="loan-count"
                name="count"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                required
                defaultValue={loan?.count}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-installment" className={labelClass}>
                Valor de la cuota
              </Label>
              <Input
                id="loan-installment"
                name="installment"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                defaultValue={loan?.installment}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loan-first" className={labelClass}>
              Fecha de la primera cuota
            </Label>
            <Input
              id="loan-first"
              name="firstDueDate"
              type="date"
              required
              defaultValue={loan?.firstDueDate ?? todayISO()}
              className="font-mono"
            />
          </div>

          <p className="text-muted-foreground font-mono text-[10.5px]">
            Con estos datos se calcula la tasa y el detalle de cada cuota. Cuenta como
            pasivo en tu patrimonio. Si ya lo tienes como una cuenta de tipo Préstamo,
            archívala para no contarlo dos veces. La cuota se registra como un gasto
            cuando la pagas.
          </p>

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : editing ? "Guardar cambios" : "Guardar préstamo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deuda informal entre personas: "le presté a..." / "me prestaron de...". */
export function PersonalDebtDialog() {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    createPersonalDebt({ error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">+ Deuda entre personas</Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            Deuda entre personas
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="debt-direction" className={labelClass}>
              Tipo
            </Label>
            <Select name="direction" defaultValue="lent">
              <SelectTrigger id="debt-direction" className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lent">Le presté (me debe)</SelectItem>
                <SelectItem value="borrowed">Me prestaron (le debo)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-person" className={labelClass}>
              Persona
            </Label>
            <Input
              id="debt-person"
              name="person"
              required
              maxLength={60}
              placeholder="Fran"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-amount" className={labelClass}>
                Monto
              </Label>
              <Input
                id="debt-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                className="font-mono"
              />
            </div>
            <CurrencyField id="debt-currency" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-date" className={labelClass}>
                Fecha
              </Label>
              <Input
                id="debt-date"
                name="occurredOn"
                type="date"
                defaultValue={todayISO()}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-notes" className={labelClass}>
                Nota
              </Label>
              <Input
                id="debt-notes"
                name="notes"
                maxLength={200}
                placeholder="opcional"
              />
            </div>
          </div>

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar deuda"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
