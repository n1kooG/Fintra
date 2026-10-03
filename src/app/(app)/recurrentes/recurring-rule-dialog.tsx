"use client";

import { useState, useTransition } from "react";
import { createRecurringRule, updateRecurringRule } from "@/server/actions/recurring";
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
import { cn } from "@/lib/utils";
import { orderCategories } from "@/lib/categories";
import { todayISO } from "@/lib/dates";
import { fromMinorUnits } from "@/lib/money";
import { FREQUENCIES, FREQUENCY_LABEL, type Frequency } from "@/lib/recurrence";
import type { AccountRow, CategoryRow, RecurringRuleRow } from "@/lib/supabase/types";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/**
 * Crear (sin `rule`) o editar (con `rule`) una regla recurrente. Al
 * editar, el tipo, la frecuencia y la fecha de inicio quedan fijos (ver
 * updateRecurringRule).
 */
export function RecurringRuleDialog({
  accounts,
  categories,
  rule,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  rule?: RecurringRuleRow;
}) {
  const editing = Boolean(rule);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">(rule?.type ?? "expense");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? undefined);
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleCategories = orderCategories(categories.filter((c) => c.kind === type));
  const backfills = !editing && startDate < todayISO();

  function handleSubmit(formData: FormData) {
    formData.set("type", type);
    if (categoryId) formData.set("categoryId", categoryId);

    startTransition(async () => {
      const result = rule
        ? await updateRecurringRule(rule.id, { error: null }, formData)
        : await createRecurringRule({ error: null }, formData);
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
        {editing ? (
          <button
            type="button"
            className="text-muted-foreground font-mono text-[9.5px] uppercase"
          >
            editar
          </button>
        ) : (
          <Button>+ Nueva regla</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background max-h-[90dvh] overflow-y-auto rounded-none sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            {editing ? "Editar recurrente" : "Nuevo recurrente"}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          {!editing ? (
            <div className="border-border flex border">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setCategoryId(categories.find((c) => c.kind === t)?.id);
                  }}
                  className={cn(
                    "flex-1 py-2 font-mono text-[11px] tracking-[0.06em] uppercase",
                    type === t
                      ? t === "expense"
                        ? "border-expense text-expense border-b-2"
                        : "border-income text-income border-b-2"
                      : "text-muted-foreground",
                  )}
                >
                  {t === "expense" ? "Gasto" : "Ingreso"}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rr-amount" className={labelClass}>
                Monto
              </Label>
              <Input
                id="rr-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                defaultValue={
                  rule
                    ? fromMinorUnits(BigInt(rule.amount_minor), rule.currency)
                    : undefined
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-merchant" className={labelClass}>
                Nombre
              </Label>
              <Input
                id="rr-merchant"
                name="merchant"
                placeholder="Arriendo, Netflix..."
                defaultValue={rule?.merchant ?? ""}
              />
            </div>
          </div>

          <div>
            <div className={cn(labelClass, "mb-2")}>Categoría</div>
            <div className="flex flex-wrap gap-2">
              {visibleCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    "border px-2.5 py-1 font-mono text-[10.5px] uppercase",
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
              defaultValue={rule?.account_id ?? accounts[0]?.id}
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

          {!editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelClass}>Frecuencia</Label>
                <Select name="frequency" defaultValue={"monthly" satisfies Frequency}>
                  <SelectTrigger className="w-full rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-start" className={labelClass}>
                  Primera fecha
                </Label>
                <Input
                  id="rr-start"
                  name="startDate"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rr-end" className={labelClass}>
              Termina (opcional)
            </Label>
            <Input
              id="rr-end"
              name="endDate"
              type="date"
              defaultValue={rule?.end_date ?? ""}
              className="font-mono"
            />
          </div>

          {backfills ? (
            <p className="text-muted-foreground font-mono text-[10.5px]">
              La primera fecha es pasada: se van a crear ahora los movimientos de las
              fechas ya vencidas.
            </p>
          ) : null}
          {editing ? (
            <p className="text-muted-foreground font-mono text-[10.5px]">
              Los cambios aplican a los próximos movimientos; los ya generados no cambian.
            </p>
          ) : null}

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : editing ? "Guardar cambios" : "Crear recurrente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
