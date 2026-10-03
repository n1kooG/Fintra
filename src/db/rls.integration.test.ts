/**
 * Prueba de aislamiento entre hogares (Row Level Security).
 *
 * Corre contra la base real (DATABASE_URL de .env.local) pero TODO ocurre
 * dentro de una unica transaccion que termina en ROLLBACK: se crean dos
 * usuarios de prueba, se dispara el trigger de alta (que arma su hogar),
 * y se intenta leer y escribir datos del otro con el rol `authenticated`
 * y los claims de cada usuario, tal como lo hace PostgREST. Al final no
 * queda ninguna fila.
 *
 * No forma parte de `npm test` (necesita red y credenciales). Se corre con
 * `npm run test:rls`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";

config({ path: ".env.local" });

const url = process.env.RLS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

class Rollback extends Error {}

type Tx = TransactionSql;
/** "ok" si la sentencia se ejecuto; si no, el codigo SQLSTATE del rechazo. */
type Attempt = "ok" | { code: string | undefined; message?: string };
type Report = {
  rlsOffTables: string[];
  triggerCategories: number;
  /** tabla -> filas de A que B alcanza a ver. */
  leaks: Record<string, number>;
  /** tabla -> filas de B que B ve (control: la prueba no es vacua). */
  ownVisible: Record<string, number>;
  insertForeignHousehold: Attempt;
  updateForeign: number;
  deleteForeign: number;
  memberInsert: Attempt;
  profileHijack: Attempt;
  anonRows: number;
  anonInsert: Attempt;
  foreignTxTags: number;
};

/** Ejecuta `fn` como el usuario indicado (o como anonimo si es null). */
async function actAs(tx: Tx, userId: string | null) {
  await tx`reset role`;
  if (userId) {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
  } else {
    await tx`select set_config('request.jwt.claims', '', true)`;
    await tx`set local role anon`;
  }
}

async function attempt(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<Attempt> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
    return "ok";
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message };
  }
}

async function scenario(tx: Tx): Promise<Report> {
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();

  // Cualquier tabla de public sin RLS activo seria un agujero. Este control
  // tambien atrapa tablas nuevas de fases futuras que olviden activarlo.
  const noRls = await tx<{ relname: string }[]>`
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by c.relname`;

  // Dos usuarios nuevos: el trigger on_auth_user_created arma sus hogares.
  await tx`insert into auth.users (id, email, raw_user_meta_data) values
    (${a}, ${`rls-a-${a}@test.invalid`}, '{"full_name":"Usuario A"}'),
    (${b}, ${`rls-b-${b}@test.invalid`}, '{"full_name":"Usuario B"}')`;

  const members = await tx<{ user_id: string; household_id: string }[]>`
    select user_id, household_id from household_members where user_id in (${a}, ${b})`;
  const hA = members.find((m) => m.user_id === a)!.household_id;
  const hB = members.find((m) => m.user_id === b)!.household_id;

  const [{ n: triggerCategories }] = await tx<{ n: number }[]>`
    select count(*)::int as n from categories where household_id = ${hA}`;

  // Cada usuario crea datos propios a traves de RLS (prueba tambien el insert).
  const accountIds: Record<string, string> = {};
  for (const [user, household] of [
    [a, hA],
    [b, hB],
  ] as const) {
    await actAs(tx, user);
    const [acc] = await tx<{ id: string }[]>`
      insert into accounts (household_id, name, type) values (${household}, 'Cuenta', 'checking')
      returning id`;
    accountIds[user] = acc.id;
    const [txn] = await tx<{ id: string }[]>`
      insert into transactions
        (household_id, account_id, type, amount_minor, currency, occurred_on, created_by)
      values (${household}, ${acc.id}, 'expense', -1000, 'CLP', '2026-01-15', ${user})
      returning id`;
    await tx`insert into tags (household_id, name) values (${household}, 'viaje')`;
    const [tag] = await tx<{ id: string }[]>`
      select id from tags where household_id = ${household} limit 1`;
    await tx`insert into transaction_tags (transaction_id, tag_id) values (${txn.id}, ${tag.id})`;
    await tx`insert into goals (household_id, name, currency, target_minor)
      values (${household}, 'Meta', 'CLP', 100000)`;
  }

  // Tablas con household_id: lo que B ve de A (debe ser 0) y de si mismo.
  await tx`reset role`;
  const tables = await tx<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'household_id'
    order by table_name`;

  const leaks: Record<string, number> = {};
  const ownVisible: Record<string, number> = {};
  await actAs(tx, b);
  for (const { table_name } of tables) {
    const id = tx(table_name);
    const [{ n: foreign }] = await tx<{ n: number }[]>`
      select count(*)::int as n from ${id} where household_id = ${hA}`;
    const [{ n: own }] = await tx<{ n: number }[]>`
      select count(*)::int as n from ${id} where household_id = ${hB}`;
    // `select *` sin filtro no debe traer nada que no sea de B.
    const [{ n: unfilteredForeign }] = await tx<{ n: number }[]>`
      select count(*)::int as n from ${id} where household_id <> ${hB}`;
    leaks[table_name] = foreign + unfilteredForeign;
    ownVisible[table_name] = own;
  }
  const [{ n: foreignTxTags }] = await tx<{ n: number }[]>`
    select count(*)::int as n from transaction_tags tt
    where tt.transaction_id not in (select id from transactions where household_id = ${hB})`;

  // B intenta escribir en el hogar de A.
  const insertForeignHousehold = await attempt(
    tx,
    (sp) =>
      sp`insert into accounts (household_id, name, type) values (${hA}, 'Intrusa', 'cash')`,
  );
  const updated =
    await tx`update accounts set name = 'hackeada' where id = ${accountIds[a]} returning id`;
  const deleted = await tx`delete from accounts where id = ${accountIds[a]} returning id`;
  const memberInsert = await attempt(
    tx,
    (sp) =>
      sp`insert into household_members (household_id, user_id, role) values (${hA}, ${b}, 'owner')`,
  );
  const profileHijack = await attempt(
    tx,
    (sp) => sp`update profiles set household_id = ${hA} where id = ${b}`,
  );

  // Anonimo: no ve ni escribe nada.
  await actAs(tx, null);
  let anonRows = 0;
  for (const { table_name } of tables) {
    // Si el rol anonimo ni siquiera puede leer la tabla (permiso denegado),
    // `attempt` falla y no suma: tambien es aislamiento valido.
    await attempt(tx, async (sp) => {
      const [{ n }] = await sp<
        { n: number }[]
      >`select count(*)::int as n from ${sp(table_name)}`;
      anonRows += n;
    });
  }
  const anonInsert = await attempt(
    tx,
    (sp) =>
      sp`insert into accounts (household_id, name, type) values (${hA}, 'Anon', 'cash')`,
  );

  await tx`reset role`;
  return {
    rlsOffTables: noRls.map((r) => r.relname),
    triggerCategories,
    leaks,
    ownVisible,
    insertForeignHousehold,
    updateForeign: updated.length,
    deleteForeign: deleted.length,
    memberInsert,
    profileHijack,
    anonRows,
    anonInsert,
    foreignTxTags,
  };
}

describe.skipIf(!url)("aislamiento entre hogares (RLS) — base real, con rollback", () => {
  let report: Report;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(url!, { prepare: false, max: 1 });
    try {
      await sql.begin(async (tx) => {
        report = await scenario(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
  });

  it("todas las tablas de public tienen RLS activo", () => {
    expect(report.rlsOffTables).toEqual([]);
  });

  it("el alta de un usuario arma su hogar con las categorias base", () => {
    expect(report.triggerCategories).toBe(10);
  });

  it("el control no es vacuo: cada usuario ve sus propios datos", () => {
    expect(report.ownVisible.accounts).toBe(1);
    expect(report.ownVisible.transactions).toBe(1);
    expect(report.ownVisible.tags).toBe(1);
    expect(report.ownVisible.goals).toBe(1);
  });

  it("un usuario no ve ninguna fila de otro hogar, en ninguna tabla", () => {
    const leaking = Object.entries(report.leaks).filter(([, n]) => n > 0);
    expect(leaking).toEqual([]);
  });

  it("no ve etiquetas de movimientos ajenos", () => {
    expect(report.foreignTxTags).toBe(0);
  });

  it("no puede insertar datos en el hogar de otro", () => {
    expect(report.insertForeignHousehold).toMatchObject({ code: "42501" });
  });

  it("no puede modificar ni borrar datos de otro hogar", () => {
    expect(report.updateForeign).toBe(0);
    expect(report.deleteForeign).toBe(0);
  });

  it("no puede agregarse como miembro de otro hogar", () => {
    expect(report.memberInsert).toMatchObject({ code: "42501" });
  });

  it("no puede mover su perfil al hogar de otro", () => {
    expect(report.profileHijack).toMatchObject({ code: "42501" });
  });

  it("un visitante sin sesion no ve ni escribe nada", () => {
    expect(report.anonRows).toBe(0);
    expect(report.anonInsert).toMatchObject({ code: "42501" });
  });
});
