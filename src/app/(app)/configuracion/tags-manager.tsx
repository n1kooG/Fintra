"use client";

import { useState, useTransition } from "react";
import { deleteTag, renameTag } from "@/server/actions/tags";
import type { TagWithCount } from "@/server/tags";

/** Etiquetas del hogar: renombrar o borrar. Se crean al cargar un movimiento. */
export function TagsManager({ tags }: { tags: TagWithCount[] }) {
  if (tags.length === 0) {
    return (
      <p className="text-muted-foreground font-mono text-[11.5px]">
        Todavía no tienes etiquetas. Se crean al cargar un movimiento: escribe, por
        ejemplo, «viaje» en el campo Etiquetas.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {tags.map((tag) => (
        <TagItem key={tag.id} tag={tag} />
      ))}
    </div>
  );
}

function TagItem({ tag }: { tag: TagWithCount }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRename(formData: FormData) {
    startTransition(async () => {
      const result = await renameTag(tag.id, { error: null }, formData);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="border-border border-b py-2">
        <form action={handleRename} className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-[13px]">#</span>
          <input
            type="text"
            name="name"
            defaultValue={tag.name}
            aria-label="Nombre de la etiqueta"
            autoFocus
            required
            maxLength={40}
            className="flex-1 bg-transparent font-mono text-[13px] focus:outline-none"
          />
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
    <div className="border-border group flex items-center justify-between gap-3 border-b py-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left font-mono text-[13px]"
      >
        #{tag.name}
      </button>
      <span className="text-muted-foreground ml-auto font-mono text-[10px] uppercase">
        {tag.count} {tag.count === 1 ? "movimiento" : "movimientos"}
      </span>
      <button
        type="button"
        onClick={() => {
          if (
            !confirm(
              `¿Eliminar la etiqueta "${tag.name}"? Los movimientos se quedan, solo pierden esta etiqueta.`,
            )
          )
            return;
          startTransition(() => deleteTag(tag.id));
        }}
        className="text-muted-foreground font-mono text-[9.5px] uppercase transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        eliminar
      </button>
    </div>
  );
}
