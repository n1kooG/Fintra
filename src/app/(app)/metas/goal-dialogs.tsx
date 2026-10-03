"use client";

import { useState, useTransition } from "react";
import { addContribution, createGoal, updateGoal } from "@/server/actions/goals";
import type { ActionState } from "@/server/actions/accounts";
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
import { CURRENCIES, fromMinorUnits, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/** Dialogo con formulario: cierra al guardar sin error, muestra el error si no. */
function useFormDialog(run: (formData: FormData) => Promise<ActionState>) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await run(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(null);
  }

  return { open, error, pending, handleSubmit, onOpenChange };
}

type EditingGoal = {
  id: string;
  name: string;
  currency: Currency;
  targetMinor: bigint;
  targetDate: string | null;
};

/** Crear (sin `goal`) o editar (con `goal`) una meta. Al editar, la moneda queda fija. */
export function GoalDialog({ goal }: { goal?: EditingGoal }) {
  const editing = Boolean(goal);
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) =>
      goal
        ? updateGoal(goal.id, { error: null }, formData)
        : createGoal({ error: null }, formData),
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
          <Button>+ Nueva meta</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            {editing ? "Editar meta" : "Nueva meta de ahorro"}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name" className={labelClass}>
              Nombre
            </Label>
            <Input
              id="goal-name"
              name="name"
              required
              maxLength={80}
              placeholder="Vacaciones, fondo de emergencia..."
              defaultValue={goal?.name}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target" className={labelClass}>
                Monto objetivo
              </Label>
              <Input
                id="goal-target"
                name="target"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                defaultValue={
                  goal ? fromMinorUnits(goal.targetMinor, goal.currency) : undefined
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Moneda</Label>
              {goal ? (
                <div className="border-border flex h-9 w-[88px] items-center border px-3 font-mono text-[13px]">
                  {goal.currency}
                </div>
              ) : (
                <Select name="currency" defaultValue="CLP">
                  <SelectTrigger className="w-[88px] rounded-none">
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
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-date" className={labelClass}>
              Fecha objetivo (opcional)
            </Label>
            <Input
              id="goal-date"
              name="targetDate"
              type="date"
              defaultValue={goal?.targetDate ?? ""}
              className="font-mono"
            />
          </div>

          {error ? (
            <p className="text-destructive font-mono text-[11px]">{error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : editing ? "Guardar cambios" : "Crear meta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContributionDialog({
  goalId,
  goalName,
  currency,
}: {
  goalId: string;
  goalName: string;
  currency: Currency;
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    addContribution(goalId, { error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          + aportar
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            Aportar a {goalName}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="contrib-amount" className={labelClass}>
              Monto ({currency})
            </Label>
            <Input
              id="contrib-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              autoFocus
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contrib-date" className={labelClass}>
                Fecha
              </Label>
              <Input
                id="contrib-date"
                name="occurredOn"
                type="date"
                defaultValue={todayISO()}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrib-notes" className={labelClass}>
                Nota
              </Label>
              <Input
                id="contrib-notes"
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
            {pending ? "Guardando..." : "Registrar aporte"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
