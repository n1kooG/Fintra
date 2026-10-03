import "server-only";
import { sqlClient } from "@/db";
import {
  listMembers,
  listPendingInvitations,
  previewInvitation,
  type InvitationInfo,
  type InvitationPreview,
  type MemberInfo,
} from "./service";

export type SharedSpace = {
  members: MemberInfo[];
  invitations: InvitationInfo[];
  isOwner: boolean;
};

/**
 * Miembros e invitaciones pendientes del espacio. Los correos de los demas
 * y las invitaciones solo los ve el propietario; un miembro ve nombres y roles.
 */
export async function getSharedSpace(
  householdId: string,
  userId: string,
): Promise<SharedSpace> {
  return sqlClient.begin(async (tx) => {
    const members = await listMembers(tx, householdId);
    const isOwner = members.some((m) => m.userId === userId && m.role === "owner");
    return {
      isOwner,
      members: isOwner
        ? members
        : members.map((m) => ({ ...m, email: m.userId === userId ? m.email : null })),
      invitations: isOwner ? await listPendingInvitations(tx, householdId) : [],
    };
  });
}

export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview | null> {
  return sqlClient.begin((tx) => previewInvitation(tx, token));
}
