"use client";

import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "dark", label: "oscuro" },
  { value: "light", label: "claro" },
  { value: "system", label: "sistema" },
] as const;

export function ThemeSelect() {
  // "theme" llega undefined en el primer render del cliente (next-themes
  // todavia no leyo la preferencia real) y asi tambien se renderiza en el
  // servidor — no hay mismatch de hidratacion, solo un instante sin boton
  // resaltado hasta que next-themes se sincroniza.
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-4 font-mono text-[10.5px] uppercase">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={cn(
            theme === opt.value
              ? "border-foreground text-foreground border-b"
              : "text-muted-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
