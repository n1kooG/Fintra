import "server-only";
import { z } from "zod";
import { toMinorUnits, type Currency } from "@/lib/money";

export type CardSettings = {
  closeDay: number | null;
  dueDay: number | null;
  limitMinor: bigint | null;
};

const dayField = z.coerce
  .number()
  .int("Los días tienen que ser números enteros.")
  .min(1, "Los días van del 1 al 31.")
  .max(31, "Los días van del 1 al 31.");

const limitField = z.coerce
  .number()
  .min(0, "El cupo no puede ser negativo.")
  .max(1_000_000_000_000, "El cupo es demasiado grande.");

/**
 * Lee del formulario el ciclo y el cupo de una tarjeta (closeDay, dueDay,
 * limit). Los tres son opcionales, pero el dia de cierre y el de pago van
 * juntos: uno solo no alcanza para calcular nada.
 */
export function parseCardSettings(
  formData: FormData,
  currency: Currency,
): { settings: CardSettings } | { error: string } {
  const closeRaw = formData.get("closeDay") || undefined;
  const dueRaw = formData.get("dueDay") || undefined;
  const limitRaw = formData.get("limit") || undefined;

  if ((closeRaw === undefined) !== (dueRaw === undefined)) {
    return { error: "Indica el día de cierre y el día de pago, o deja ambos en blanco." };
  }

  const settings: CardSettings = { closeDay: null, dueDay: null, limitMinor: null };

  if (closeRaw !== undefined && dueRaw !== undefined) {
    const close = dayField.safeParse(closeRaw);
    const due = dayField.safeParse(dueRaw);
    if (!close.success)
      return { error: close.error.issues[0]?.message ?? "Día de cierre inválido." };
    if (!due.success)
      return { error: due.error.issues[0]?.message ?? "Día de pago inválido." };
    settings.closeDay = close.data;
    settings.dueDay = due.data;
  }

  if (limitRaw !== undefined) {
    const limit = limitField.safeParse(limitRaw);
    if (!limit.success)
      return { error: limit.error.issues[0]?.message ?? "Cupo inválido." };
    settings.limitMinor = toMinorUnits(limit.data, currency);
  }

  return { settings };
}
