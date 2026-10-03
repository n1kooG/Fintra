"use client";

import { useState, useTransition } from "react";
import { saveBudget } from "@/server/actions/budgets";
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
import { DISPLAY_CURRENCIES, fromMinorUnits, type Currency } from "@/lib/money";
import type { CategoryRow } from "@/lib/supabase/types";
import { orderCategories } from "@/lib/categories";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

type EditingLine = {
  categoryId: string;
  categoryName: string;
  /** Monto base (sin arrastre). */
  amountMinor: bigint;
  currency: Currency;
  rollover?: boolean;
};

/**
 * Crear (sin `line`) o editar (con `line`) el presupuesto de una
 * categoria para un mes. Al editar, la categoria queda fija.
 */
export function BudgetFormDialog({
  monthKey,
  categories,
  display,
  line,
}: {
  monthKey: string;
  /** Categorias de gasto que todavia no tienen presupuesto en este mes (solo al crear). */
  categories: CategoryRow[];
  display: Currency;
  line?: EditingLine;
}) {
  const editing = Boolean(line);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(line?.categoryId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    if (categoryId) formData.set("categoryId", categoryId);
    startTransition(async () => {
      const result = await saveBudget(monthKey, { error: null }, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
        if (!editing) setCategoryId(undefined);
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
          <Button disabled={categories.length === 0}>+ Nuevo presupuesto</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            {editing ? line!.categoryName : "Nuevo presupuesto"}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          {!editing ? (
            <div className="space-y-1.5">
              <Label className={labelClass}>Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger className="w-full rounded-none">
                  <SelectValue placeholder="Elegir categoría" />
                </SelectTrigger>
                <SelectContent>
                  {orderCategories(categories).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bd-amount" className={labelClass}>
                Tope del mes
              </Label>
              <Input
                id="bd-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                autoFocus
                defaultValue={
                  line ? fromMinorUnits(line.amountMinor, line.currency) : undefined
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Moneda</Label>
              <Select name="currency" defaultValue={line?.currency ?? display}>
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

          <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
            <input
              type="checkbox"
              name="rollover"
              defaultChecked={line?.rollover ?? false}
              className="accent-foreground mt-1"
            />
            <span>
              Sumar lo que sobró el mes anterior
              <span className="text-muted-foreground block font-mono text-[10.5px]">
                Si el mes pasado no gastaste todo, la diferencia se suma a este tope. Un
                exceso no se descuenta.
              </span>
            </span>
          </label>

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar presupuesto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
