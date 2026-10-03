"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTransaction } from "@/server/actions/transactions";
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
import { fromMinorUnits, type Currency } from "@/lib/money";
import type { AccountRow, CategoryRow } from "@/lib/supabase/types";

type EditableTransaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  type: "income" | "expense";
  amount_minor: string;
  currency: Currency;
  occurred_on: string;
  merchant: string | null;
  notes: string | null;
  tags: string[];
};

export function EditTransactionForm({
  transaction,
  accounts,
  categories,
  tagSuggestions,
}: {
  transaction: EditableTransaction;
  accounts: AccountRow[];
  categories: CategoryRow[];
  tagSuggestions: string[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleCategories = orderCategories(
    categories.filter((c) => c.kind === transaction.type),
  );
  const amount = Math.abs(
    fromMinorUnits(BigInt(transaction.amount_minor), transaction.currency),
  );

  function handleSubmit(formData: FormData) {
    formData.set("type", transaction.type);
    if (categoryId) formData.set("categoryId", categoryId);

    startTransition(async () => {
      const result = await updateTransaction(transaction.id, { error: null }, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex w-full max-w-[420px] flex-col gap-6">
      <div className="space-y-1.5">
        <Label
          htmlFor="amount"
          className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
        >
          Monto
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          required
          defaultValue={amount}
          className={cn(
            "border-border h-auto border-0 border-b p-0 pb-2 font-mono text-[40px] font-semibold shadow-none focus-visible:ring-0",
            transaction.type === "expense" ? "text-expense" : "text-income",
          )}
        />
      </div>

      <div>
        <div className="text-muted-foreground mb-2 font-mono text-[9.5px] tracking-[0.08em] uppercase">
          Categoría
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
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
        <Label className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase">
          Cuenta
        </Label>
        <Select name="accountId" defaultValue={transaction.account_id} required>
          <SelectTrigger className="w-full rounded-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="occurredOn"
            className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
          >
            Fecha
          </Label>
          <Input
            id="occurredOn"
            name="occurredOn"
            type="date"
            defaultValue={transaction.occurred_on}
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="merchant"
            className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase"
          >
            Comercio / nota
          </Label>
          <Input
            id="merchant"
            name="merchant"
            defaultValue={transaction.merchant ?? ""}
            placeholder="opcional"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase">
          Etiquetas
        </Label>
        <TagInput suggestions={tagSuggestions} defaultValue={transaction.tags} />
      </div>

      {error ? <p className="text-destructive font-mono text-[11px]">{error}</p> : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground flex-1 py-3.5 text-[12.5px]"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending} className="flex-1 py-3.5 text-[12.5px]">
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
