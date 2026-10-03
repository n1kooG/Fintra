"use client";

import { useMemo, useState, useTransition } from "react";
import { createTransaction } from "@/server/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TagInput } from "@/components/tag-input";
import { orderCategories } from "@/lib/categories";
import { todayISO } from "@/lib/dates";
import { matchRule, type CategorizationRule } from "@/lib/categorization";
import { FREQUENCIES, FREQUENCY_LABEL } from "@/lib/recurrence";
import type { AccountRow, CategoryRow } from "@/lib/supabase/types";

type MovementType = "expense" | "income" | "transfer";

const TYPE_LABEL: Record<MovementType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

const INSTALLMENT_OPTIONS = [2, 3, 4, 5, 6, 9, 10, 12, 18, 24, 36, 48];

const labelClass =
  "text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase";

export function TransactionForm({
  accounts,
  categories,
  rules,
  tagSuggestions,
  initial,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  rules: CategorizationRule[];
  tagSuggestions: string[];
  /** Datos con los que parte el formulario al duplicar un movimiento. */
  initial?: {
    type: "income" | "expense";
    amount: number;
    merchant: string | null;
    categoryId: string | null;
    accountId: string;
    tags: string[];
  };
}) {
  const [type, setType] = useState<MovementType>(initial?.type ?? "expense");
  const [categoryId, setCategoryId] = useState<string | undefined>(
    initial?.categoryId ??
      orderCategories(
        categories.filter((c) => c.kind === (initial?.type ?? "expense")),
      )[0]?.id,
  );
  // Una vez que se elige una categoria a mano (o se duplica una), las reglas dejan de pisarla.
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial));
  const [matchedPattern, setMatchedPattern] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id);
  const [fromAccountId, setFromAccountId] = useState<string>();
  const [toAccountId, setToAccountId] = useState<string>();
  const [repeat, setRepeat] = useState<string>("none");
  const [installments, setInstallments] = useState<string>("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currencyOf = (id: string | undefined) =>
    accounts.find((a) => a.id === id)?.currency;
  const fromCurrency = currencyOf(fromAccountId);
  const toCurrency = currencyOf(toAccountId);
  const crossCurrency =
    type === "transfer" && fromCurrency && toCurrency && fromCurrency !== toCurrency;
  const amountCurrency = type === "transfer" ? fromCurrency : currencyOf(accountId);

  // Cuotas: solo gastos en una tarjeta de credito. Sin dia de cierre y de pago
  // configurados (en Tarjetas) no se puede calcular cuando se factura cada cuota.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCard = type === "expense" && selectedAccount?.type === "credit_card";
  const cardConfigured =
    selectedAccount?.statement_close_day != null &&
    selectedAccount?.payment_due_day != null;
  const inInstallments = isCard && cardConfigured && installments !== "1";

  const kind = type === "income" ? "income" : "expense";
  const visibleCategories = useMemo(
    () => orderCategories(categories.filter((c) => c.kind === kind)),
    [categories, kind],
  );

  function handleTypeChange(next: MovementType) {
    setType(next);
    setCategoryTouched(false);
    setMatchedPattern(null);
    if (next !== "transfer") {
      const firstOfKind = orderCategories(
        categories.filter((c) => c.kind === (next === "income" ? "income" : "expense")),
      )[0];
      setCategoryId(firstOfKind?.id);
    }
  }

  function handleMerchantChange(merchant: string) {
    if (type === "transfer" || categoryTouched) return;
    const rule = matchRule(merchant, kind, rules);
    setMatchedPattern(rule?.pattern ?? null);
    if (rule) setCategoryId(rule.categoryId);
  }

  function handleSubmit(formData: FormData) {
    formData.set("type", type);
    if (type !== "transfer") {
      if (categoryId) formData.set("categoryId", categoryId);
      if (repeat !== "none" && !inInstallments) formData.set("repeat", repeat);
      if (inInstallments) formData.set("installments", installments);
    }

    startTransition(async () => {
      const result = await createTransaction({ error: null }, formData);
      if (result?.error) setError(result.error);
    });
  }

  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground max-w-xs text-center font-mono text-xs">
        Primero necesitas al menos una cuenta.{" "}
        <a href="/cuentas" className="border-foreground text-foreground border-b">
          Crear una cuenta
        </a>
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="flex w-full max-w-[420px] flex-col gap-6">
      <div className="border-border flex border">
        {(["expense", "income", "transfer"] as MovementType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTypeChange(t)}
            className={cn(
              "flex-1 py-2 font-mono text-[11.5px] tracking-[0.06em] uppercase",
              type === t
                ? t === "expense"
                  ? "border-expense text-expense border-b-2"
                  : t === "income"
                    ? "border-income text-income border-b-2"
                    : "border-transfer text-transfer border-b-2"
                : "text-muted-foreground",
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="amount" className={labelClass}>
          Monto{amountCurrency ? ` (${amountCurrency})` : ""}
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          required
          autoFocus
          placeholder="0"
          defaultValue={initial?.amount}
          className={cn(
            "border-border h-auto border-0 border-b p-0 pb-2 font-mono text-[40px] font-semibold shadow-none focus-visible:ring-0",
            type === "expense" && "text-expense",
            type === "income" && "text-income",
            type === "transfer" && "text-transfer",
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="merchant" className={labelClass}>
          {type === "transfer" ? "Descripción" : "Comercio"}
        </Label>
        <Input
          id="merchant"
          name="merchant"
          placeholder="opcional"
          autoComplete="off"
          defaultValue={initial?.merchant ?? ""}
          onChange={(e) => handleMerchantChange(e.target.value)}
        />
      </div>

      {type === "transfer" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>Desde</Label>
              <Select
                name="fromAccountId"
                required
                value={fromAccountId}
                onValueChange={setFromAccountId}
              >
                <SelectTrigger className="w-full rounded-none">
                  <SelectValue placeholder="Cuenta" />
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
              <Label className={labelClass}>Hacia</Label>
              <Select
                name="toAccountId"
                required
                value={toAccountId}
                onValueChange={setToAccountId}
              >
                <SelectTrigger className="w-full rounded-none">
                  <SelectValue placeholder="Cuenta" />
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
          </div>

          {crossCurrency ? (
            <div className="space-y-1.5">
              <Label htmlFor="receivedAmount" className={labelClass}>
                Monto recibido ({toCurrency})
              </Label>
              <Input
                id="receivedAmount"
                name="receivedAmount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="vacío = cotización del día"
                className="font-mono"
              />
              <p className="text-muted-foreground font-mono text-[10px]">
                Si lo dejas vacío se calcula con el dólar/UF de la fecha. Si tu banco usó
                otro tipo de cambio, escribe lo que realmente llegó.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={labelClass}>Categoría</span>
              {matchedPattern && !categoryTouched ? (
                <span className="text-muted-foreground font-mono text-[9.5px]">
                  auto · regla «{matchedPattern}»
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setCategoryTouched(true);
                  }}
                  className={cn(
                    "border px-3 py-1.5 font-mono text-[11px] tracking-[0.03em] uppercase",
                    categoryId === c.id
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Cuenta</Label>
            <Select
              name="accountId"
              value={accountId}
              onValueChange={setAccountId}
              required
            >
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
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="occurredOn" className={labelClass}>
            Fecha
          </Label>
          <Input
            id="occurredOn"
            name="occurredOn"
            type="date"
            defaultValue={todayISO()}
            className="font-mono"
          />
        </div>
        {type !== "transfer" ? (
          <div className="space-y-1.5">
            <Label className={labelClass}>Repetir</Label>
            <Select
              value={inInstallments ? "none" : repeat}
              onValueChange={setRepeat}
              disabled={inInstallments}
            >
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No se repite</SelectItem>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {isCard ? (
        <div className="space-y-1.5">
          <Label className={labelClass}>Cuotas</Label>
          {cardConfigured ? (
            <Select value={installments} onValueChange={setInstallments}>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Al contado</SelectItem>
                {INSTALLMENT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} cuotas sin interés
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground font-mono text-[10.5px]">
              Para pagar en cuotas, configura el día de cierre y de pago de esta tarjeta
              en{" "}
              <a href="/tarjetas" className="border-foreground text-foreground border-b">
                Tarjetas
              </a>
              .
            </p>
          )}
          {inInstallments ? (
            <p className="text-muted-foreground font-mono text-[10.5px]">
              La compra se registra una vez por el total; las cuotas se facturan mes a mes
              desde el próximo estado de cuenta.
            </p>
          ) : null}
        </div>
      ) : null}

      {type !== "transfer" ? (
        <div className="space-y-1.5">
          <Label className={labelClass}>Etiquetas</Label>
          <TagInput suggestions={tagSuggestions} defaultValue={initial?.tags} />
        </div>
      ) : null}

      {error ? <p className="text-destructive font-mono text-[11px]">{error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full py-3.5 text-[12.5px]">
        {pending ? "Guardando..." : "Guardar movimiento"}
      </Button>
    </form>
  );
}
