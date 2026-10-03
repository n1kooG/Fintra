import "server-only";
import type { TransactionSql } from "postgres";
import {
  emailsMatch,
  hashInviteToken,
  inviteState,
  INVITE_ERROR,
  isValidTokenShape,
} from "@/lib/invitations";

/**
 * Operaciones sobre la pertenencia a un espacio compartido. Cada una recibe
 * una transaccion abierta (asi las pruebas de integracion pueden correrla y
 * revertirla) y se conecta con el rol dueno de la base: SALTA RLS, de modo
 * que cada funcion comprueba por si misma quien es quien (propietario,
 * miembro, dueno del correo invitado).
 */
type Sql = TransactionSql;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type MemberInfo = {
  userId: string;
  role: "owner" | "member";
  displayName: string;
  email: string | null;
  joinedAt: string;
};

export type InvitationInfo = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

async function roleOf(tx: Sql, householdId: string, userId: string) {
  const [row] = await tx<{ role: "owner" | "member" }[]>`
    select role from household_members where household_id = ${householdId} and user_id = ${userId}`;
  return row?.role ?? null;
}

/** Crea un espacio propio (con las categorias base) para quien se queda sin uno. */
export async function createPersonalHousehold(
  tx: Sql,
  userId: string,
  displayName: string,
): Promise<string> {
  const [household] = await tx<{ id: string }[]>`
    insert into households (name) values (${`${displayName} — Fintra`}) returning id`;
  await tx`insert into household_members (household_id, user_id, role)
    values (${household.id}, ${userId}, 'owner')`;
  await tx`select public.seed_default_categories(${household.id})`;
  return household.id;
}

/** Con el pooler (sin consultas preparadas) postgres.js entrega las fechas como texto, no como Date. */
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

export async function listMembers(tx: Sql, householdId: string): Promise<MemberInfo[]> {
  const rows = await tx<
    {
      user_id: string;
      role: "owner" | "member";
      joined_at: Date;
      display_name: string | null;
    }[]
  >`
    select m.user_id, m.role, m.joined_at, p.display_name
    from household_members m
    left join profiles p on p.id = m.user_id
    where m.household_id = ${householdId}
    order by m.joined_at`;

  const emails =
    rows.length > 0
      ? await tx<{ id: string; email: string | null }[]>`
          select id, email from auth.users where id in ${tx(rows.map((r) => r.user_id))}`
      : [];
  const emailById = new Map(emails.map((e) => [e.id, e.email]));

  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name ?? "Sin nombre",
    email: emailById.get(r.user_id) ?? null,
    joinedAt: toIso(r.joined_at),
  }));
}

export async function listPendingInvitations(
  tx: Sql,
  householdId: string,
): Promise<InvitationInfo[]> {
  const rows = await tx<
    { id: string; email: string; expires_at: Date; created_at: Date }[]
  >`
    select id, email, expires_at, created_at from household_invitations
    where household_id = ${householdId} and accepted_at is null
    order by created_at desc`;
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    expiresAt: toIso(r.expires_at),
    createdAt: toIso(r.created_at),
    expired: r.expires_at.getTime() <= now,
  }));
}

/** Crea una invitacion (solo el propietario). Reemplaza la pendiente anterior al mismo correo. */
export async function createInvitation(
  tx: Sql,
  args: {
    householdId: string;
    actorId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<Result> {
  if ((await roleOf(tx, args.householdId, args.actorId)) !== "owner") {
    return { ok: false, error: "Solo quien creó el espacio puede invitar." };
  }

  const email = args.email.trim().toLowerCase();
  const [already] = await tx<{ n: number }[]>`
    select count(*)::int as n
    from household_members m join auth.users u on u.id = m.user_id
    where m.household_id = ${args.householdId} and lower(u.email) = ${email}`;
  if (already.n > 0) return { ok: false, error: "Esa persona ya está en el espacio." };

  await tx`delete from household_invitations
    where household_id = ${args.householdId} and lower(email) = ${email} and accepted_at is null`;
  await tx`insert into household_invitations
    (household_id, email, token_hash, role, invited_by, expires_at)
    values (${args.householdId}, ${email}, ${args.tokenHash}, 'member', ${args.actorId}, ${args.expiresAt})`;
  return { ok: true };
}

export async function revokeInvitation(
  tx: Sql,
  args: { householdId: string; actorId: string; invitationId: string },
): Promise<Result> {
  if ((await roleOf(tx, args.householdId, args.actorId)) !== "owner") {
    return {
      ok: false,
      error: "Solo quien creó el espacio puede cancelar invitaciones.",
    };
  }
  await tx`delete from household_invitations
    where id = ${args.invitationId} and household_id = ${args.householdId} and accepted_at is null`;
  return { ok: true };
}

export type InvitationPreview = {
  householdName: string;
  inviterName: string;
  email: string;
  state: "valid" | "expired" | "accepted";
};

/** Lo que se muestra en la pagina del enlace, sin consumirlo. */
export async function previewInvitation(
  tx: Sql,
  token: string,
): Promise<InvitationPreview | null> {
  if (!isValidTokenShape(token)) return null;
  const hash = await hashInviteToken(token);
  const [row] = await tx<
    {
      email: string;
      expires_at: Date;
      accepted_at: Date | null;
      household_name: string;
      inviter_name: string | null;
    }[]
  >`
    select i.email, i.expires_at, i.accepted_at, h.name as household_name, p.display_name as inviter_name
    from household_invitations i
    join households h on h.id = i.household_id
    left join profiles p on p.id = i.invited_by
    where i.token_hash = ${hash}`;
  if (!row) return null;
  return {
    householdName: row.household_name,
    inviterName: row.inviter_name ?? "Alguien",
    email: row.email,
    state: inviteState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at }),
  };
}

/**
 * Une a `userId` al espacio de la invitacion. Reglas:
 *  - el correo de la cuenta debe ser el invitado;
 *  - su espacio personal actual se descarta SOLO si no tiene movimientos
 *    (una cuenta o dos de recien registrado no se pierden nada valioso);
 *    si ya tiene movimientos, se rechaza para no mezclar ni borrar datos.
 * Todo en la transaccion del llamador: o se une o no cambia nada.
 */
export async function acceptInvitation(
  tx: Sql,
  args: { userId: string; userEmail: string | null | undefined; token: string },
): Promise<Result<{ householdId: string }>> {
  if (!isValidTokenShape(args.token)) return { ok: false, error: INVITE_ERROR.invalid };
  const hash = await hashInviteToken(args.token);

  const [invite] = await tx<
    {
      id: string;
      household_id: string;
      email: string;
      role: "owner" | "member";
      expires_at: Date;
      accepted_at: Date | null;
    }[]
  >`select id, household_id, email, role, expires_at, accepted_at
    from household_invitations where token_hash = ${hash} for update`;
  if (!invite) return { ok: false, error: INVITE_ERROR.invalid };

  const state = inviteState({
    expiresAt: invite.expires_at,
    acceptedAt: invite.accepted_at,
  });
  if (state === "accepted") return { ok: false, error: INVITE_ERROR.accepted };
  if (state === "expired") return { ok: false, error: INVITE_ERROR.expired };
  if (!emailsMatch(invite.email, args.userEmail)) {
    return { ok: false, error: INVITE_ERROR.wrongEmail };
  }

  const memberships = await tx<{ household_id: string }[]>`
    select household_id from household_members where user_id = ${args.userId}`;
  if (memberships.some((m) => m.household_id === invite.household_id)) {
    return { ok: false, error: INVITE_ERROR.alreadyMember };
  }

  // Sus espacios actuales: ninguno puede tener movimientos.
  const oldIds = memberships.map((m) => m.household_id);
  if (oldIds.length > 0) {
    // Dejar un espacio compartido sin su propietario lo dejaria huerfano.
    const [orphaning] = await tx<{ n: number }[]>`
      select count(*)::int as n from household_members me
      where me.user_id = ${args.userId} and me.role = 'owner' and me.household_id in ${tx(oldIds)}
        and exists (
          select 1 from household_members o
          where o.household_id = me.household_id and o.user_id <> me.user_id
        )`;
    if (orphaning.n > 0) return { ok: false, error: INVITE_ERROR.ownsSharedSpace };

    const [withData] = await tx<{ n: number }[]>`
      select count(*)::int as n from transactions where household_id in ${tx(oldIds)}`;
    if (withData.n > 0) return { ok: false, error: INVITE_ERROR.hasData };
  }

  await tx`insert into household_members (household_id, user_id, role)
    values (${invite.household_id}, ${args.userId}, ${invite.role})`;
  // Primero el perfil: borrar el espacio viejo arrastraria el perfil por cascada.
  await tx`update profiles set household_id = ${invite.household_id} where id = ${args.userId}`;
  if (oldIds.length > 0) {
    // Solo se borran espacios donde no queda nadie mas (nunca el de otra persona).
    await tx`delete from households h where h.id in ${tx(oldIds)}
      and not exists (
        select 1 from household_members m
        where m.household_id = h.id and m.user_id <> ${args.userId}
      )`;
    await tx`delete from household_members
      where user_id = ${args.userId} and household_id in ${tx(oldIds)}`;
  }
  await tx`update household_invitations
    set accepted_at = now(), accepted_by = ${args.userId} where id = ${invite.id}`;

  return { ok: true, householdId: invite.household_id };
}

/** El propietario saca a otro miembro, o un miembro sale por su cuenta; quien sale recibe un espacio propio nuevo. */
export async function removeMember(
  tx: Sql,
  args: { householdId: string; actorId: string; targetUserId: string },
): Promise<Result> {
  const actorRole = await roleOf(tx, args.householdId, args.actorId);
  if (!actorRole) return { ok: false, error: "No formas parte de este espacio." };

  const leavingByOwnWill = args.actorId === args.targetUserId;
  if (!leavingByOwnWill && actorRole !== "owner") {
    return {
      ok: false,
      error: "Solo quien creó el espacio puede sacar a otras personas.",
    };
  }

  const targetRole = await roleOf(tx, args.householdId, args.targetUserId);
  if (!targetRole) return { ok: false, error: "Esa persona no está en el espacio." };
  if (targetRole === "owner") {
    return {
      ok: false,
      error:
        "Quien creó el espacio no puede salir de él. Si ya no lo quieres, elimina tu cuenta desde Configuración.",
    };
  }

  const [profile] = await tx<{ display_name: string | null }[]>`
    select display_name from profiles where id = ${args.targetUserId}`;
  const personalId = await createPersonalHousehold(
    tx,
    args.targetUserId,
    profile?.display_name ?? "Mi espacio",
  );
  await tx`update profiles set household_id = ${personalId} where id = ${args.targetUserId}`;
  await tx`delete from household_members
    where household_id = ${args.householdId} and user_id = ${args.targetUserId}`;
  // Sus avisos del dispositivo eran del espacio anterior.
  await tx`delete from push_subscriptions
    where household_id = ${args.householdId} and user_id = ${args.targetUserId}`;
  return { ok: true };
}
