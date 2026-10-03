"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { parseTotpCode } from "@/lib/mfa";

export type MfaEnrollment =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; message: string };

export type MfaResult = { ok: boolean; message: string };

/**
 * Empieza a activar la verificacion: crea un factor TOTP sin verificar y devuelve
 * el QR y la clave para la aplicacion de autenticacion. No queda activo hasta
 * confirmar un codigo (confirmMfaEnrollment). Un enrolamiento abandonado se
 * descarta al empezar otro.
 */
export async function startMfaEnrollment(): Promise<MfaEnrollment> {
  await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError)
    return { ok: false, message: "No pudimos revisar tu cuenta. Intenta de nuevo." };
  if (factors.totp.length > 0) {
    return { ok: false, message: "La verificación en dos pasos ya está activada." };
  }
  // Los factores a medio activar (no aparecen en `totp`) se limpian: si no, el nombre choca.
  for (const stale of factors.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  )) {
    await supabase.auth.mfa.unenroll({ factorId: stale.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Fintra",
    issuer: "Fintra",
  });
  if (error || !data) {
    return {
      ok: false,
      message: "No pudimos preparar la verificación. Intenta de nuevo.",
    };
  }
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/** Confirma el codigo de la aplicacion y deja la verificacion activa. */
export async function confirmMfaEnrollment(
  factorId: string,
  rawCode: string,
): Promise<MfaResult> {
  if (!z.string().uuid().safeParse(factorId).success) {
    return { ok: false, message: "La activación no es válida. Empieza de nuevo." };
  }
  const code = parseTotpCode(rawCode);
  if (!code)
    return { ok: false, message: "Escribe los 6 dígitos que muestra tu aplicación." };

  await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return {
      ok: false,
      message: "Código incorrecto o vencido. Prueba con el código actual.",
    };
  }
  revalidatePath("/configuracion");
  return { ok: true, message: "Verificación en dos pasos activada." };
}

/** Desactiva la verificacion; pide un codigo vigente para comprobar que quien lo pide la tiene. */
export async function disableMfa(rawCode: string): Promise<MfaResult> {
  const code = parseTotpCode(rawCode);
  if (!code)
    return { ok: false, message: "Escribe los 6 dígitos que muestra tu aplicación." };

  await requireCurrentHousehold();
  const supabase = await createClient();
  const { data, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  if (listError || !factor)
    return { ok: false, message: "No tienes la verificación activada." };

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (verifyError) {
    return {
      ok: false,
      message: "Código incorrecto o vencido. Prueba con el código actual.",
    };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { ok: false, message: "No pudimos desactivarla. Intenta de nuevo." };

  revalidatePath("/configuracion");
  return { ok: true, message: "Verificación en dos pasos desactivada." };
}
