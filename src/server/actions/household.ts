"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sqlClient } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  INVITE_ERROR,
} from "@/lib/invitations";
import {
  acceptInvitation,
  createInvitation,
  removeMember,
  revokeInvitation,
} from "@/server/households/service";

export type InviteState = { error: string | null; link?: string };

function revalidateSharedViews() {
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
}

/** Crea la invitacion y devuelve el enlace (que se muestra una sola vez). */
export async function inviteMember(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = z.email("Escribe un correo válido.").safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { error: email.error.issues[0].message };

  const { userId, householdId } = await requireCurrentHousehold();
  const token = generateInviteToken();

  const result = await sqlClient.begin(async (tx) =>
    createInvitation(tx, {
      householdId,
      actorId: userId,
      email: email.data,
      tokenHash: await hashInviteToken(token),
      expiresAt: inviteExpiry(new Date()),
    }),
  );
  if (!result.ok) return { error: result.error };

  const h = await headers();
  const origin =
    h.get("origin") ?? `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  revalidateSharedViews();
  return { error: null, link: `${origin}/invitacion/${token}` };
}

export async function revokeInvite(invitationId: string) {
  if (!z.string().uuid().safeParse(invitationId).success)
    throw new Error("Invitación inválida.");
  const { userId, householdId } = await requireCurrentHousehold();
  const result = await sqlClient.begin((tx) =>
    revokeInvitation(tx, { householdId, actorId: userId, invitationId }),
  );
  if (!result.ok) throw new Error(result.error);
  revalidateSharedViews();
}

/** El propietario saca a otra persona del espacio. */
export async function removeHouseholdMember(targetUserId: string) {
  if (!z.string().uuid().safeParse(targetUserId).success)
    throw new Error("Persona inválida.");
  const { userId, householdId } = await requireCurrentHousehold();
  const result = await sqlClient.begin((tx) =>
    removeMember(tx, { householdId, actorId: userId, targetUserId }),
  );
  if (!result.ok) throw new Error(result.error);
  revalidateSharedViews();
}

/** Un miembro sale del espacio compartido y vuelve a tener uno propio. */
export async function leaveHousehold() {
  const { userId, householdId } = await requireCurrentHousehold();
  const result = await sqlClient.begin((tx) =>
    removeMember(tx, { householdId, actorId: userId, targetUserId: userId }),
  );
  if (!result.ok) throw new Error(result.error);
  revalidateSharedViews();
  redirect("/dashboard");
}

/** Acepta la invitacion del enlace con la sesion actual. */
export async function acceptInvite(token: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: INVITE_ERROR.invalid };

  const result = await sqlClient.begin((tx) =>
    acceptInvitation(tx, { userId: user.id, userEmail: user.email, token }),
  );
  if (!result.ok) return { error: result.error };

  revalidateSharedViews();
  redirect("/dashboard");
}
