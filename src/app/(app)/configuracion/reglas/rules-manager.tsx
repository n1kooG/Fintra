"use client";

import { useState, useTransition } from "react";
import {
  applyRulesToHistory,
  createCategorizationRule,
  deleteCategorizationRule,
} from "@/server/actions/categorization";
import type { CategorizationRuleWithCategory } from "@/server/queries/categorization";
import type { CategoryRow } from "@/lib/supabase/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryLabels, orderCategories } from "@/lib/categories";

export function RulesManager({
  rules,
  categories,
}: {
  rules: CategorizationRuleWithCategory[];
  categories: CategoryRow[];
}) {
  const [categoryId, setCategoryId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expense = orderCategories(categories.filter((c) => c.kind === "expense"));
  const income = orderCategories(categories.filter((c) => c.kind === "income"));
  const labels = categoryLabels(categories);

  function handleCreate(formData: FormData) {
    if (categoryId) formData.set("categoryId", categoryId);
    startTransition(async () => {
      const result = await createCategorizationRule({ error: null }, formData);
      setError(result.error);
    });
  }

  function handleApply() {
    if (
      !confirm(
        "Se va a recategorizar todo movimiento cuyo comercio coincida con una regla, aunque le hayas elegido otra categoría a mano. ¿Continuar?",
      )
    )
      return;
    startTransition(async () => {
      const result = await applyRulesToHistory();
      setApplyMessage(
        result.error ??
          (result.updated === 0
            ? "Ningún movimiento necesitaba cambios."
            : `${result.updated} ${result.updated === 1 ? "movimiento recategorizado" : "movimientos recategorizados"}.`),
      );
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={handleCreate} className="flex flex-col gap-3">
        <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
          Nueva regla
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
              Si el comercio contiene
            </span>
            <input
              type="text"
              name="pattern"
              required
              placeholder="uber, lider, netflix..."
              className="border-input placeholder:text-muted-foreground border-b bg-transparent py-1.5 text-[13.5px] focus:outline-none"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
              Categoría
            </span>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Gastos</SelectLabel>
                  {expense.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Ingresos</SelectLabel>
                  {income.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="border-foreground border-b pb-1 font-mono text-[10.5px] uppercase disabled:opacity-50"
          >
            + agregar
          </button>
        </div>
        {error ? <p className="text-destructive font-mono text-[11px]">{error}</p> : null}
      </form>

      <div>
        <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
          Reglas ({rules.length})
        </div>
        {rules.length === 0 ? (
          <p className="text-muted-foreground py-4 text-[14px] italic">
            Todavía no hay reglas
          </p>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="border-border group flex items-baseline gap-3 border-b py-2.5"
            >
              <span className="font-mono text-[12.5px]">«{rule.pattern}»</span>
              <span className="text-muted-foreground font-mono text-[10px]">→</span>
              <span className="flex-1 text-[14px] italic">
                {labels.get(rule.categoryId) ?? rule.categoryName}
              </span>
              <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
                {rule.kind === "income" ? "ingreso" : "gasto"}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => deleteCategorizationRule(rule.id))}
                className="text-muted-foreground font-mono text-[9.5px] uppercase disabled:opacity-50 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
              >
                eliminar
              </button>
            </div>
          ))
        )}
      </div>

      {rules.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={handleApply}
            className="border-foreground self-start border-b pb-1 font-mono text-[10.5px] uppercase disabled:opacity-50"
          >
            {pending ? "aplicando..." : "aplicar reglas al historial"}
          </button>
          {applyMessage ? (
            <p className="text-muted-foreground font-mono text-[11px]">{applyMessage}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
