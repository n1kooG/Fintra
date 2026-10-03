import { cn } from "@/lib/utils";

export type ProgressTone = "neutral" | "warning" | "danger" | "good";

const TONE_CLASS: Record<ProgressTone, string> = {
  neutral: "bg-foreground",
  warning: "bg-expense/60",
  danger: "bg-expense",
  good: "bg-income",
};

/**
 * Barra de avance fina (estilo libro mayor). El color nunca va solo: quien
 * la usa siempre escribe al lado el porcentaje y el estado en texto.
 */
export function ProgressLine({
  percent,
  tone = "neutral",
  label,
  className,
}: {
  percent: number;
  tone?: ProgressTone;
  /** Descripcion para lectores de pantalla ("Supermercado: 72% usado"). */
  label: string;
  className?: string;
}) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className={cn("bg-border h-[3px] w-full", className)}
    >
      <div className={cn("h-full", TONE_CLASS[tone])} style={{ width: `${value}%` }} />
    </div>
  );
}
