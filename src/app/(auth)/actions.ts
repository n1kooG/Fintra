"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthState = { error: string | null };

export async function signInWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect(next);
}

/** URL del callback de OAuth/confirmacion, conservando un destino interno distinto del inicio. */
function callbackUrl(origin: string | null, next: string) {
  const base = `${origin}/auth/callback`;
  return next === "/dashboard" ? base : `${base}?next=${encodeURIComponent(next)}`;
}

export async function signUpWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: callbackUrl(origin, next),
    },
  });

  if (error) {
    return { error: "No pudimos crear la cuenta. Prueba con otro correo." };
  }

  redirect(
    next === "/dashboard"
      ? "/login?registrado=1"
      : `/login?registrado=1&next=${encodeURIComponent(next)}`,
  );
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(origin, next) },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

/** Cierra la sesion y vuelve al login conservando un destino interno (p. ej. una invitacion). */
export async function signOutTo(next: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
