"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AuthState } from "../actions";

export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/configuracion`,
  });

  // Respuesta identica exista o no la cuenta, para no revelar que
  // correos estan registrados.
  return { error: null };
}
