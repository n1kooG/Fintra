"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseTotpCode } from "@/lib/mfa";
import { safeNextPath } from "@/lib/safe-redirect";
import type { AuthState } from "../actions";

/**
 * Completa el inicio de sesion con el codigo de la aplicacion de autenticacion.
 * Si el codigo es correcto, Supabase sube la sesion a aal2 (y renueva las cookies
 * en esta misma respuesta). Los reintentos los limita Supabase del lado del servidor.
 */
export async function verifyMfaLogin(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const code = parseTotpCode(formData.get("code"));
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!code) return { error: "Escribe los 6 dígitos que muestra tu aplicación." };

  const supabase = await createClient();
  const { data, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  if (listError || !factor) {
    return {
      error:
        "No encontramos tu verificación en dos pasos. Cierra sesión e inicia de nuevo.",
    };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (error)
    return { error: "Código incorrecto o vencido. Prueba con el código actual." };

  redirect(next);
}
