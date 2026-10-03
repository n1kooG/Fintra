"use client";

import { usePrivacy } from "./privacy-provider";
import { cn } from "@/lib/utils";

export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      className={cn(
        "font-mono text-[10.5px] tracking-[0.06em] uppercase",
        hidden ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {hidden ? "mostrar montos" : "ocultar montos"}
    </button>
  );
}
