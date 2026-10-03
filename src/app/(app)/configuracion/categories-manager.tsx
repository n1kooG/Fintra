"use client";

import { useState, useTransition } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/server/actions/categories";
import type { CategoryRow } from "@/lib/supabase/types";
import { orderCategories, type OrderedCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

const selectClass =
  "border-input text-muted-foreground max-w-[160px] border-b bg-transparent py-1.5 font-mono text-[11px] focus:outline-none";

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  return (
    <div className="flex flex-col gap-8">
      <CategoryGroup title="Categorías de gasto" kind="expense" categories={expense} />
      <CategoryGroup title="Categorías de ingreso" kind="income" categories={income} />
    </div>
  );
}

function CategoryGroup({
  title,
  kind,
  categories,
}: {
  title: string;
  kind: "income" | "expense";
  categories: CategoryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ordered = orderCategories(categories);
  const parents = ordered.filter((c) => c.depth === 0);

  function handleCreate(formData: FormData) {
    formData.set("kind", kind);
    startTransition(async () => {
      const result = await createCategory({ error: null }, formData);
      setError(result?.error ?? null);
    });
  }

  return (
    <div>
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        {title}
      </div>
      <div className="flex flex-col">
        {ordered.map((c) => (
          <CategoryItem
            key={c.id}
            category={c}
            parents={parents}
            hasChildren={ordered.some((o) => o.parent_id === c.id)}
          />
        ))}
      </div>
      <form action={handleCreate} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="name"
          placeholder="Nueva categoría..."
          aria-label={`Nueva categoría de ${kind === "expense" ? "gasto" : "ingreso"}`}
          required
          maxLength={60}
          className="border-input placeholder:text-muted-foreground min-w-[140px] flex-1 border-b bg-transparent py-1.5 text-[13px] focus:outline-none"
        />
        {parents.length > 0 ? (
          <select
            name="parentId"
            defaultValue=""
            aria-label="Dentro de"
            className={selectClass}
          >
            <option value="">principal</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                dentro de {p.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="text-muted-foreground font-mono text-[10.5px] uppercase disabled:opacity-50"
        >
          + agregar
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-destructive mt-1 font-mono text-[11px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CategoryItem({
  category,
  parents,
  hasChildren,
}: {
  category: OrderedCategory<CategoryRow>;
  parents: OrderedCategory<CategoryRow>[];
  hasChildren: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Una principal con subcategorias no puede pasar a ser subcategoria
  // (solo hay dos niveles), y sin otra principal a la que irse no hay a donde mover.
  const canMove = !hasChildren && parents.some((p) => p.id !== category.id);

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await updateCategory(category.id, { error: null }, formData);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className={cn("border-border border-b py-2", category.depth === 1 && "pl-5")}>
        <form action={handleSave} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="name"
            defaultValue={category.name}
            aria-label="Nombre de la categoría"
            autoFocus
            required
            maxLength={60}
            className="min-w-[120px] flex-1 bg-transparent text-[13.5px] focus:outline-none"
          />
          {canMove ? (
            <select
              name="parentId"
              defaultValue={category.parent_id ?? ""}
              aria-label="Dentro de"
              className={selectClass}
            >
              <option value="">principal</option>
              {parents
                .filter((p) => p.id !== category.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    dentro de {p.name}
                  </option>
                ))}
            </select>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="font-mono text-[10px] uppercase"
          >
            guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="text-muted-foreground font-mono text-[10px] uppercase"
          >
            cancelar
          </button>
        </form>
        {error ? (
          <p role="alert" className="text-destructive mt-1 font-mono text-[11px]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border group flex items-center justify-between border-b py-2",
        category.depth === 1 && "pl-5",
      )}
    >
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-[13.5px] italic"
      >
        {category.depth === 1 ? "↳ " : ""}
        {category.name}
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            !confirm(
              `¿Eliminar "${category.name}"? Sus movimientos quedan sin categoría, se borran sus presupuestos y reglas, y sus subcategorías pasan a ser principales.`,
            )
          )
            return;
          startTransition(() => deleteCategory(category.id));
        }}
        className="text-muted-foreground font-mono text-[9.5px] uppercase transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        eliminar
      </button>
    </div>
  );
}
