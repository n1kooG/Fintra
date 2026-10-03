"use client";

import { useMemo, useState } from "react";
import { addLoanPrepayment } from "@/server/actions/loans";
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
import {
  amortizationSchedule,
  outstandingAt,
  type LoanTerms,
  type Prepayment,
  type PrepaymentMode,
} from "@/lib/loans";
import { toMinorUnits, type Currency } from "@/lib/money";
import { formatShortDay, todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

type AccountOption = { id: string; name: string };

/**
 * Registrar un abono extraordinario al capital. Mientras se escribe, el
 * simulador recalcula la tabla y muestra cuanto se ahorra en intereses y en
 * cuotas (o cuanto baja la cuota), sin guardar nada.
 */
export function PrepaymentDialog({
  loanId,
  name,
  currency,
  terms,
  existing,
  accounts,
}: {
  loanId: string;
  name: string;
  currency: Currency;
  terms: LoanTerms;
  existing: Prepayment[];
  /** Cuentas en la misma moneda del préstamo, para descontar el abono. */
  accounts: AccountOption[];
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [mode, setMode] = useState<PrepaymentMode>("shorten_term");
  const [accountId, setAccountId] = useState("none");

  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) => {
      formData.set("mode", mode);
      if (accountId !== "none") formData.set("accountId", accountId);
      return addLoanPrepayment(loanId, { error: null }, formData);
    },
  );

  const preview = useMemo(() => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      return null;
    }
    const amountMinor = toMinorUnits(value, currency);
    const base = amortizationSchedule(terms, existing);
    if (!base || amountMinor <= 0n) return null;

    const owed = outstandingAt(terms.principalMinor, base.rows, paidOn, existing);
    if (amountMinor > owed) return { tooBig: true as const, owedMinor: owed };

    const withExtra = amortizationSchedule(terms, [
      ...existing,
      { paidOn, amountMinor, mode },
    ]);
    if (!withExtra) return null;
    const interest = (rows: typeof base.rows) =>
      rows.reduce((sum, r) => sum + r.interestMinor, 0n);
    const applied = withExtra.rows.findIndex(
      (r) => r.extraMinor > 0n && r.dueDate >= paidOn,
    );
    return {
      tooBig: false as const,
      interestSavedMinor: interest(base.rows) - interest(withExtra.rows),
      installmentsSaved: base.rows.length - withExtra.rows.length,
      lastDueDate: withExtra.rows.at(-1)?.dueDate ?? null,
      newInstallmentMinor:
        applied >= 0 && withExtra.rows[applied + 1]
          ? withExtra.rows[applied + 1].installmentMinor
          : null,
    };
  }, [amount, paidOn, mode, terms, existing, currency]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          abonar al capital
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background max-h-[90dvh] overflow-y-auto rounded-none sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Abono a {name}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Un abono extraordinario baja el capital que debes y, con él, los intereses. Se
            aplica desde la cuota siguiente a su fecha.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pre-amount" className={labelClass}>
                Monto ({currency})
              </Label>
              <Input
                id="pre-amount"
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pre-date" className={labelClass}>
                Fecha
              </Label>
              <Input
                id="pre-date"
                name="paidOn"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Qué hacer con el ahorro</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PrepaymentMode)}>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shorten_term">Terminar antes (misma cuota)</SelectItem>
                <SelectItem value="reduce_installment">
                  Bajar la cuota (mismo plazo)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preview ? (
            preview.tooBig ? (
              <p role="status" className="text-destructive font-mono text-[11px]">
                Es más de lo que debes en esa fecha (
                <Amount
                  amountMinor={preview.owedMinor}
                  currency={currency}
                  tone="neutral"
                />
                ).
              </p>
            ) : (
              <div
                role="status"
                className="border-border text-muted-foreground border-l-2 pl-3 font-mono text-[11.5px]"
              >
                Ahorrarías{" "}
                <Amount
                  amountMinor={preview.interestSavedMinor}
                  currency={currency}
                  withSymbol
                  tone="income"
                />{" "}
                en intereses
                {mode === "shorten_term" && preview.installmentsSaved > 0
                  ? `, pagarías ${preview.installmentsSaved} ${preview.installmentsSaved === 1 ? "cuota" : "cuotas"} menos y terminarías el ${
                      preview.lastDueDate
                        ? `${formatShortDay(preview.lastDueDate)} ${preview.lastDueDate.slice(0, 4)}`
                        : ""
                    }`
                  : ""}
                {mode === "reduce_installment" && preview.newInstallmentMinor !== null ? (
                  <>
                    ; la cuota bajaría a{" "}
                    <Amount
                      amountMinor={preview.newInstallmentMinor}
                      currency={currency}
                      withSymbol
                      tone="neutral"
                    />
                  </>
                ) : null}
                .
              </div>
            )
          ) : null}

          {accounts.length > 0 ? (
            <div className="space-y-1.5">
              <Label className={labelClass}>Descontar de una cuenta (opcional)</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No descontar</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground font-mono text-[10.5px]">
                Si pagaste desde una cuenta, descuéntalo para que su saldo y tu patrimonio
                cuadren: baja la deuda, pero también la plata.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="pre-note" className={labelClass}>
              Nota
            </Label>
            <Input id="pre-note" name="note" maxLength={120} placeholder="opcional" />
          </div>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Registrar abono"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
