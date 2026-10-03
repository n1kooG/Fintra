"use client";

import { usePrivacy } from "@/components/privacy/privacy-provider";
import { formatAmount, formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tone = "income" | "expense" | "transfer" | "neutral";

type AmountProps = {
  amountMinor: bigint;
  currency: Currency;
  /** "always" pinta y firma segun el signo del monto (para movimientos). "neutral" no colorea (para saldos de cuenta). */
  tone?: Tone | "auto";
  /**
   * Si se pasa, fuerza mostrar u ocultar el simbolo de moneda. Sin
   * especificar, el CLP se muestra sin simbolo (estilo ledger, como en
   * el resto del sistema) y cualquier otra moneda SIEMPRE lo muestra
   * (bare "312" seria ambiguo: podria ser CLP o USD).
   */
  withSymbol?: boolean;
  signDisplay?: "auto" | "always" | "never";
  className?: string;
};

const TONE_CLASS: Record<Tone, string> = {
  income: "text-income",
  expense: "text-expense",
  transfer: "text-transfer",
  neutral: "",
};

/**
 * Punto unico de formateo de dinero en la UI: aplica separador de miles
 * y decimales correctos, respeta el modo privacidad (oculta el monto
 * sin ocultar el resto de la fila), y colorea segun el signo — nunca
 * solo con color, siempre con el +/- impreso (regla de accesibilidad
 * del sistema de diseno).
 */
export function Amount({
  amountMinor,
  currency,
  tone = "auto",
  withSymbol,
  signDisplay = "auto",
  className,
}: AmountProps) {
  const { hidden } = usePrivacy();
  const showSymbol = withSymbol ?? currency !== "CLP";

  const resolvedTone: Tone =
    tone === "auto"
      ? amountMinor > 0n
        ? "income"
        : amountMinor < 0n
          ? "expense"
          : "neutral"
      : tone;

  if (hidden) {
    return (
      <span className={cn("font-mono tabular-nums", className)} aria-label="Monto oculto">
        &bull;&bull;&bull;&bull;&bull;
      </span>
    );
  }

  const text = showSymbol
    ? formatMoney(amountMinor, currency, { signDisplay })
    : formatAmount(amountMinor, currency, { signDisplay });

  return (
    <span className={cn("font-mono tabular-nums", TONE_CLASS[resolvedTone], className)}>
      {text}
    </span>
  );
}
