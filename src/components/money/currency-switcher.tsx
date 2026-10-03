"use client";

import { useTransition } from "react";
import { setDisplayCurrency } from "@/server/actions/preferences";
import { DISPLAY_CURRENCIES, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Selector de la moneda de visualizacion de los totales consolidados.
 * Es una preferencia del perfil (se guarda en la base), no un estado
 * local: el mismo valor aplica en dashboard, cuentas y movimientos, y
 * en cualquier dispositivo.
 */
export function CurrencySwitcher({
  value,
  className,
}: {
  value: Currency;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label="Moneda de visualización"
      className={cn(
        "flex gap-3 font-mono text-[10.5px] tracking-[0.06em] uppercase",
        pending && "opacity-60",
        className,
      )}
    >
      {DISPLAY_CURRENCIES.map((currency) => (
        <button
          key={currency}
          type="button"
          role="radio"
          aria-checked={currency === value}
          disabled={pending}
          onClick={() => {
            if (currency !== value) startTransition(() => setDisplayCurrency(currency));
          }}
          className={
            currency === value
              ? "border-foreground text-foreground border-b"
              : "text-muted-foreground hover:text-foreground"
          }
        >
          {currency}
        </button>
      ))}
    </div>
  );
}
