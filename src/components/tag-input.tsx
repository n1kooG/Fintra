"use client";

import { useState } from "react";
import {
  cleanTagName,
  parseTagNames,
  tagKey,
  MAX_TAGS_PER_TRANSACTION,
} from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * Selector de etiquetas de un movimiento: las ya elegidas como fichas que se
 * quitan al tocarlas, un campo para escribir nuevas (Enter o coma) y las
 * etiquetas existentes como sugerencias. Envia el resultado en un campo
 * oculto `tags` (nombres separados por coma) que la accion del servidor lee.
 */
export function TagInput({
  suggestions,
  defaultValue = [],
}: {
  /** Nombres de las etiquetas que ya existen en el hogar. */
  suggestions: string[];
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(() => parseTagNames(defaultValue));
  const [draft, setDraft] = useState("");

  const full = selected.length >= MAX_TAGS_PER_TRANSACTION;

  function add(raw: string) {
    setSelected((current) => parseTagNames([...current, raw]));
    setDraft("");
  }

  function remove(name: string) {
    setSelected((current) => current.filter((n) => tagKey(n) !== tagKey(name)));
  }

  const available = suggestions.filter(
    (s) => !selected.some((n) => tagKey(n) === tagKey(s)),
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name="tags" value={selected.join(",")} />

      <div className="border-input flex flex-wrap items-center gap-2 border-b pb-1.5">
        {selected.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => remove(name)}
            aria-label={`Quitar la etiqueta ${name}`}
            className="border-foreground text-foreground border px-2 py-0.5 font-mono text-[11px]"
          >
            #{name} ×
          </button>
        ))}
        <input
          type="text"
          value={draft}
          disabled={full}
          maxLength={50}
          autoComplete="off"
          placeholder={
            full ? "máximo alcanzado" : selected.length ? "otra..." : "viaje, regalos..."
          }
          aria-label="Agregar etiqueta"
          onChange={(e) => {
            const value = e.target.value;
            // Una coma cierra la etiqueta que se estaba escribiendo.
            if (value.includes(",")) add(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Enter no debe enviar el formulario
              if (cleanTagName(draft)) add(draft);
            } else if (e.key === "Backspace" && draft === "" && selected.length > 0) {
              setSelected((current) => current.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (cleanTagName(draft)) add(draft);
          }}
          className="placeholder:text-muted-foreground min-w-[120px] flex-1 bg-transparent py-1 font-mono text-[12px] focus:outline-none"
        />
      </div>

      {available.length > 0 && !full ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Etiquetas existentes"
        >
          {available.slice(0, 12).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className={cn(
                "border-border text-muted-foreground hover:border-foreground hover:text-foreground border px-2 py-0.5 font-mono text-[11px]",
              )}
            >
              + {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
