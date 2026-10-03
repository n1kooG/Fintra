"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { DISPLAY_CURRENCIES } from "@/lib/money";
import { syncLatestRates } from "@/server/fx/sync";

/** Cambia la moneda en la que se muestran los totales consolidados. */
export async function setDisplayCurrency(currency: string) {
  const parsed = z.enum(DISPLAY_CURRENCIES).safeParse(currency);
  if (!parsed.success) throw new Error("Moneda inválida.");

  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_currency: parsed.data })
    .eq("id", userId);
  if (error) throw new Error("No pudimos guardar la preferencia.");

  // La moneda de visualizacion afecta a todas las pantallas con totales.
  revalidatePath("/", "layout");
}

/** Boton "Actualizar ahora" de Configuracion: trae las cotizaciones del dia sin esperar al cron. */
export async function syncRatesNow(): Promise<{ saved: number; error: string | null }> {
  await requireCurrentHousehold();
  const result = await syncLatestRates();
  revalidatePath("/", "layout");
  return {
    saved: result.saved,
    error: result.errors.length > 0 ? result.errors.join(" · ") : null,
  };
}
