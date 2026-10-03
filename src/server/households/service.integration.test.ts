/**
 * Invitaciones y pertenencia al espacio, contra el esquema REAL y dentro de
 * una transaccion que siempre termina en ROLLBACK (ver rls.integration.test.ts).
 * `npm run test:rls`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";

config({ path: ".env.local" });

const url = process.env.RLS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

class Rollback extends Error {}
type Tx = TransactionSql;

type Outcome = Record<string, unknown>;

async function newUser(tx: Tx, label: string) {
  const id = crypto.randomUUID();
  const email = `${label}-${id}@test.invalid`;
  await tx`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}, ${email}, ${`{"full_name":"${label}"}`})`;
  const [{ household_id }] = await tx<{ household_id: string }[]>`
    select household_id from household_members where user_id = ${id}`;
  return { id, email, householdId: household_id };
}

async function scenario(tx: Tx): Promise<Outcome> {
  const {
    acceptInvitation,
    createInvitation,
    removeMember,
    previewInvitation,
    revokeInvitation,
    listMembers,
  } = await import("@/server/households/service");
  const { generateInviteToken, hashInviteToken, inviteExpiry } =
    await import("@/lib/invitations");

  const out: Outcome = {};
  const owner = await newUser(tx, "owner");
  const invitee = await newUser(tx, "invitee");
  const stranger = await newUser(tx, "stranger");

  // Cuenta sin movimientos en el espacio personal del invitado: se descarta al unirse.
  await tx`insert into accounts (household_id, name, type) values (${invitee.householdId}, 'Recien creada', 'cash')`;

  async function invite(email: string, expiresAt = inviteExpiry(new Date())) {
    const token = generateInviteToken();
    const result = await createInvitation(tx, {
      householdId: owner.householdId,
      actorId: owner.id,
      email,
      tokenHash: await hashInviteToken(token),
      expiresAt,
    });
    return { token, result };
  }

  // --- crear ---
  const first = await invite(invitee.email);
  out.createOk = first.result.ok;
  out.memberCannotInvite = await createInvitation(tx, {
    householdId: owner.householdId,
    actorId: invitee.id, // todavia no es miembro
    email: "x@test.invalid",
    tokenHash: await hashInviteToken(generateInviteToken()),
    expiresAt: inviteExpiry(new Date()),
  });
  out.preview = await previewInvitation(tx, first.token);
  out.previewGarbage = await previewInvitation(tx, "no-es-un-token");

  // Reemplaza la pendiente anterior al mismo correo.
  const second = await invite(invitee.email.toUpperCase());
  const [{ n: pendingForInvitee }] = await tx<{ n: number }[]>`
    select count(*)::int as n from household_invitations
    where household_id = ${owner.householdId} and lower(email) = ${invitee.email.toLowerCase()}`;
  out.pendingForInvitee = pendingForInvitee;
  out.oldTokenDead = await acceptInvitation(tx, {
    userId: invitee.id,
    userEmail: invitee.email,
    token: first.token,
  });

  // --- aceptar con la cuenta equivocada ---
  out.wrongEmail = await acceptInvitation(tx, {
    userId: stranger.id,
    userEmail: stranger.email,
    token: second.token,
  });

  // --- aceptar bien ---
  out.accept = await acceptInvitation(tx, {
    userId: invitee.id,
    userEmail: invitee.email.toUpperCase(),
    token: second.token,
  });
  const members = await listMembers(tx, owner.householdId);
  out.members = members.map((m) => ({ id: m.userId, role: m.role }));
  const [prof] = await tx<{ household_id: string }[]>`
    select household_id from profiles where id = ${invitee.id}`;
  out.profileMoved = prof.household_id === owner.householdId;
  const [{ n: oldHouseholdLeft }] = await tx<{ n: number }[]>`
    select count(*)::int as n from households where id = ${invitee.householdId}`;
  out.oldHouseholdLeft = oldHouseholdLeft;
  const [{ n: inviteeMemberships }] = await tx<{ n: number }[]>`
    select count(*)::int as n from household_members where user_id = ${invitee.id}`;
  out.inviteeMemberships = inviteeMemberships;

  out.reuse = await acceptInvitation(tx, {
    userId: invitee.id,
    userEmail: invitee.email,
    token: second.token,
  });

  // --- invitar a quien ya esta ---
  out.inviteExisting = (await invite(invitee.email)).result;

  // --- un miembro no puede sacar a otros ni al propietario ---
  out.memberRemovesOwner = await removeMember(tx, {
    householdId: owner.householdId,
    actorId: invitee.id,
    targetUserId: owner.id,
  });
  out.ownerRemovesSelf = await removeMember(tx, {
    householdId: owner.householdId,
    actorId: owner.id,
    targetUserId: owner.id,
  });

  // --- el propietario saca al miembro: recibe un espacio propio con categorias ---
  out.remove = await removeMember(tx, {
    householdId: owner.householdId,
    actorId: owner.id,
    targetUserId: invitee.id,
  });
  const [after] = await tx<{ household_id: string }[]>`
    select household_id from profiles where id = ${invitee.id}`;
  out.removedGotOwnHousehold = after.household_id !== owner.householdId;
  const [{ n: categories }] = await tx<{ n: number }[]>`
    select count(*)::int as n from categories where household_id = ${after.household_id}`;
  out.removedCategories = categories;
  const [{ role: newRole }] = await tx<{ role: string }[]>`
    select role from household_members where household_id = ${after.household_id} and user_id = ${invitee.id}`;
  out.removedIsOwnerOfNew = newRole;
  const [{ n: stillInOwners }] = await tx<{ n: number }[]>`
    select count(*)::int as n from household_members
    where household_id = ${owner.householdId} and user_id = ${invitee.id}`;
  out.stillInOwners = stillInOwners;

  // --- con movimientos no se puede unir ---
  const busy = await newUser(tx, "busy");
  const [acc] = await tx<{ id: string }[]>`
    insert into accounts (household_id, name, type) values (${busy.householdId}, 'Con datos', 'cash') returning id`;
  await tx`insert into transactions
    (household_id, account_id, type, amount_minor, currency, occurred_on, created_by)
    values (${busy.householdId}, ${acc.id}, 'expense', -1000, 'CLP', '2026-01-01', ${busy.id})`;
  const busyInvite = await invite(busy.email);
  out.hasData = await acceptInvitation(tx, {
    userId: busy.id,
    userEmail: busy.email,
    token: busyInvite.token,
  });
  const [{ n: busyKeeps }] = await tx<{ n: number }[]>`
    select count(*)::int as n from households where id = ${busy.householdId}`;
  out.busyKeepsHousehold = busyKeeps;

  // --- vencida ---
  const late = await newUser(tx, "late");
  const expired = await invite(late.email, new Date(Date.now() - 1000));
  out.expired = await acceptInvitation(tx, {
    userId: late.id,
    userEmail: late.email,
    token: expired.token,
  });

  // --- cancelar ---
  const cancelMe = await newUser(tx, "cancel");
  const toCancel = await invite(cancelMe.email);
  const [pending] = await tx<{ id: string }[]>`
    select id from household_invitations where token_hash = ${await hashInviteToken(toCancel.token)}`;
  out.revokeByNonOwner = await revokeInvitation(tx, {
    householdId: owner.householdId,
    actorId: stranger.id,
    invitationId: pending.id,
  });
  out.revokeByOwner = await revokeInvitation(tx, {
    householdId: owner.householdId,
    actorId: owner.id,
    invitationId: pending.id,
  });
  out.afterRevoke = await acceptInvitation(tx, {
    userId: cancelMe.id,
    userEmail: cancelMe.email,
    token: toCancel.token,
  });

  // --- propietario de un espacio compartido no puede abandonarlo para unirse a otro ---
  const other = await newUser(tx, "other-owner");
  const shared = await newUser(tx, "shared-member");
  await tx`insert into household_members (household_id, user_id, role)
    values (${other.householdId}, ${shared.id}, 'member')`;
  const toOther = await invite(other.email);
  out.ownsShared = await acceptInvitation(tx, {
    userId: other.id,
    userEmail: other.email,
    token: toOther.token,
  });

  return out;
}

describe.skipIf(!url)("invitaciones y pertenencia (base real, con rollback)", () => {
  let o: Outcome;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(url!, { prepare: false, max: 1 });
    try {
      await sql.begin(async (tx) => {
        o = await scenario(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
  });

  it("solo el propietario crea invitaciones", () => {
    expect(o.createOk).toBe(true);
    expect(o.memberCannotInvite).toMatchObject({ ok: false });
  });

  it("la vista previa muestra el espacio y rechaza tokens mal formados", () => {
    expect(o.preview).toMatchObject({ state: "valid" });
    expect(o.previewGarbage).toBeNull();
  });

  it("una invitacion nueva al mismo correo reemplaza a la anterior", () => {
    expect(o.pendingForInvitee).toBe(1);
    expect(o.oldTokenDead).toMatchObject({ ok: false });
  });

  it("solo la cuenta del correo invitado puede aceptar", () => {
    expect(o.wrongEmail).toMatchObject({ ok: false });
  });

  it("al aceptar se une, mueve su perfil y descarta su espacio vacio", () => {
    expect(o.accept).toMatchObject({ ok: true });
    expect(o.members).toHaveLength(2);
    expect(o.profileMoved).toBe(true);
    expect(o.oldHouseholdLeft).toBe(0);
    expect(o.inviteeMemberships).toBe(1);
  });

  it("el enlace es de un solo uso", () => {
    expect(o.reuse).toMatchObject({ ok: false });
  });

  it("no se invita a quien ya esta en el espacio", () => {
    expect(o.inviteExisting).toMatchObject({ ok: false });
  });

  it("un miembro no saca al propietario y el propietario no puede salir", () => {
    expect(o.memberRemovesOwner).toMatchObject({ ok: false });
    expect(o.ownerRemovesSelf).toMatchObject({ ok: false });
  });

  it("al sacar a un miembro recibe un espacio propio con categorias base", () => {
    expect(o.remove).toMatchObject({ ok: true });
    expect(o.removedGotOwnHousehold).toBe(true);
    expect(o.removedCategories).toBe(10);
    expect(o.removedIsOwnerOfNew).toBe("owner");
    expect(o.stillInOwners).toBe(0);
  });

  it("no mezcla datos: con movimientos no se puede unir y conserva su espacio", () => {
    expect(o.hasData).toMatchObject({ ok: false });
    expect(o.busyKeepsHousehold).toBe(1);
  });

  it("una invitacion vencida no sirve", () => {
    expect(o.expired).toMatchObject({ ok: false });
  });

  it("solo el propietario cancela, y una cancelada ya no sirve", () => {
    expect(o.revokeByNonOwner).toMatchObject({ ok: false });
    expect(o.revokeByOwner).toMatchObject({ ok: true });
    expect(o.afterRevoke).toMatchObject({ ok: false });
  });

  it("el propietario de un espacio compartido no lo deja huerfano", () => {
    expect(o.ownsShared).toMatchObject({ ok: false });
  });
});
