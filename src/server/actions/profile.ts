"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import type { ActionState } from "./accounts";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // limite de bcrypt, que usa Supabase Auth

const nameSchema = z.string().trim().min(1, "Escribe un nombre.").max(80);

/** ¿La cuenta tiene contrasena propia? (Una cuenta solo-Google no la tiene.) */
function hasPasswordLogin(user: User): boolean {
  return (user.identities ?? []).some((i) => i.provider === "email");
}

/**
 * Comprueba la contrasena actual iniciando sesion con ella. Es la
 * confirmacion de identidad antes de cambiar la contrasena o eliminar la
 * cuenta: una sesion abierta olvidada en otro equipo no basta.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!password) return false;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function updateProfileName(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", userId);
  if (error) return { error: "No pudimos guardar el nombre." };

  await supabase.auth.updateUser({ data: { full_name: parsed.data } });
  revalidatePath("/", "layout");
  return { error: null };
}

/** Solo el propietario del espacio puede renombrarlo (usa el cliente admin: households no tiene politica de UPDATE). */
export async function renameHousehold(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { userId, householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return { error: "Solo quien creó el espacio puede cambiarle el nombre." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "El servidor no está configurado para esta acción." };
  const { error } = await admin
    .from("households")
    .update({ name: parsed.data })
    .eq("id", householdId);
  if (error) return { error: "No pudimos guardar el nombre del espacio." };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCurrentHousehold();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No hay una sesión activa." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < MIN_PASSWORD) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (next.length > MAX_PASSWORD) {
    return { error: `La contraseña puede tener hasta ${MAX_PASSWORD} caracteres.` };
  }
  if (next !== confirm) return { error: "Las contraseñas nuevas no coinciden." };

  if (hasPasswordLogin(user)) {
    if (next === current) return { error: "La contraseña nueva debe ser distinta." };
    if (!(await verifyPassword(user.email, current))) {
      return { error: "La contraseña actual no es correcta." };
    }
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: "No pudimos cambiar la contraseña. Inténtalo de nuevo." };
  return { error: null };
}

/** Pide el cambio de correo: Supabase manda un enlace de confirmacion al correo nuevo. */
export async function requestEmailChange(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCurrentHousehold();
  const parsed = z.email("Escribe un correo válido.").safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() === parsed.data) {
    return { error: "Ese ya es tu correo." };
  }

  const origin = (await headers()).get("origin");
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
  );
  if (error) return { error: "No pudimos pedir el cambio de correo." };
  return { error: null };
}

/**
 * Elimina la cuenta y, si es la unica persona del espacio, todos sus
 * datos (la cascada de households borra cuentas, movimientos, etc.). Si el
 * espacio tiene mas miembros, solo sale de el y los datos se quedan con los
 * demas. Pide el correo escrito y, si la cuenta tiene contrasena, tambien
 * la contrasena.
 */
export async function deleteAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId, householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No hay una sesión activa." };

  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (typed !== user.email.toLowerCase()) {
    return { error: "Escribe tu correo exactamente para confirmar." };
  }
  if (hasPasswordLogin(user)) {
    if (!(await verifyPassword(user.email, String(formData.get("password") ?? "")))) {
      return { error: "La contraseña no es correcta." };
    }
  }

  const admin = createAdminClient();
  if (!admin) return { error: "El servidor no está configurado para esta acción." };

  const { data: members, error: membersError } = await admin
    .from("household_members")
    .select("user_id, role, joined_at")
    .eq("household_id", householdId)
    .order("joined_at");
  if (membersError || !members) return { error: "No pudimos revisar tu espacio." };

  const others = members.filter((m) => m.user_id !== userId);
  const me = members.find((m) => m.user_id === userId);

  if (others.length === 0) {
    // Unica persona: se borra el espacio completo (todo cae por cascada).
    const { error } = await admin.from("households").delete().eq("id", householdId);
    if (error) return { error: "No pudimos eliminar tus datos. No se cambió nada." };
  } else {
    // Hay mas gente: solo se sale. Los datos son del espacio, no de una persona.
    await admin.from("push_subscriptions").delete().eq("user_id", userId);
    await admin.from("household_members").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    if (me?.role === "owner" && !others.some((m) => m.role === "owner")) {
      await admin
        .from("household_members")
        .update({ role: "owner" })
        .eq("household_id", householdId)
        .eq("user_id", others[0].user_id);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return {
      error:
        "Tus datos se eliminaron, pero no pudimos cerrar la cuenta de acceso. Escríbenos para terminar el proceso.",
    };
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?cuenta=eliminada");
}
