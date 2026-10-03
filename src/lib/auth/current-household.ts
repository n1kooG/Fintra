import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/money";

export type CurrentHousehold = {
  userId: string;
  householdId: string;
  displayName: string;
  householdName: string;
  /** Moneda de los totales consolidados (preferencia del perfil). */
  displayCurrency: Currency;
  /** Ya paso (o salto) el asistente de primer uso. */
  onboarded: boolean;
};

/**
 * Trae el usuario autenticado junto con su household activo. Se usa en
 * Server Components y Server Actions para scopear toda lectura/escritura
 * por `household_id` — ademas de RLS (que ya lo exige a nivel de base de
 * datos), esto evita depender solo de la politica y falla rapido si por
 * algun motivo no hay sesion.
 *
 * Devuelve `null` si no hay sesion — quien llama decide si redirige o no.
 */
export const getCurrentHousehold = cache(
  async function getCurrentHousehold(): Promise<CurrentHousehold | null> {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, household_id, display_currency, households(name)")
      .eq("id", user.id)
      .single();

    if (!profile) return null;

    return {
      userId: user.id,
      householdId: profile.household_id,
      displayName: profile.display_name ?? user.email?.split("@")[0] ?? "Cuenta",
      householdName:
        (profile.households as { name?: string } | null)?.name ?? "Espacio personal",
      displayCurrency: (profile.display_currency as Currency | null) ?? "CLP",
      onboarded: user.user_metadata?.onboarded === true,
    };
  },
);

/** Igual que getCurrentHousehold, pero lanza si no hay sesion — para usar en Server Actions donde la ausencia de sesion es un error, no un caso a manejar. */
export async function requireCurrentHousehold(): Promise<CurrentHousehold> {
  const current = await getCurrentHousehold();
  if (!current) throw new Error("No hay una sesión activa.");
  return current;
}
