/**
 * Restauracion de respaldos contra el esquema REAL (base de Supabase), en
 * una transaccion que siempre termina en ROLLBACK. Siembra un hogar origen
 * con filas en todas las tablas, lo exporta como lo hace PostgREST
 * (to_jsonb), lo restaura en un hogar destino que ya tenia datos, y
 * comprueba que el destino quedo igual al origen, con ids nuevos y sin
 * tocar el origen. `npm run test:rls`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";

config({ path: ".env.local" });

const url = process.env.RLS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

class Rollback extends Error {}
type Tx = TransactionSql;

type Result = {
  counts: Record<string, number>;
  sourceCounts: Record<string, number>;
  targetCountsBefore: Record<string, number>;
  targetCountsAfter: Record<string, number>;
  dropped: number;
  foreignRefs: number;
  txTotalSource: string;
  txTotalTarget: string;
  tagLinksAfter: number;
  categoryParentLinked: boolean;
  profileCurrency: string;
  holdingColumns: { source: string; target: string };
};

const TABLES = [
  "accounts",
  "categories",
  "tags",
  "recurring_rules",
  "categorization_rules",
  "budgets",
  "budget_totals",
  "goals",
  "goal_contributions",
  "transactions",
  "transfers",
  "installment_plans",
  "loans",
  "loan_prepayments",
  "personal_debts",
  "holdings",
  "holding_flows",
  "holding_valuations",
] as const;

async function countAll(tx: Tx, householdId: string) {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from ${tx(t)} where household_id = ${householdId}`;
    out[t] = n;
  }
  return out;
}

async function newUser(tx: Tx, label: string) {
  const id = crypto.randomUUID();
  await tx`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}, ${`${label}-${id}@test.invalid`}, '{"full_name":"Prueba"}')`;
  const [{ household_id }] = await tx<{ household_id: string }[]>`
    select household_id from household_members where user_id = ${id}`;
  return { userId: id, householdId: household_id };
}

/** Siembra filas en todas las tablas del hogar. */
async function seed(tx: Tx, h: string, userId: string) {
  const [acc1] = await tx<{ id: string }[]>`
    insert into accounts (household_id, name, type, currency, initial_balance_minor)
    values (${h}, 'Corriente', 'checking', 'CLP', 100000) returning id`;
  const [acc2] = await tx<{ id: string }[]>`
    insert into accounts (household_id, name, type, currency, credit_limit_minor, statement_close_day, payment_due_day)
    values (${h}, 'Tarjeta', 'credit_card', 'CLP', 2000000, 10, 25) returning id`;
  const [parent] = await tx<{ id: string }[]>`
    select id from categories where household_id = ${h} and name = 'Supermercado'`;
  // Hija insertada ANTES que el nuevo padre en el to_jsonb final no importa:
  // el orden lo decide prepareRestore.
  const [child] = await tx<{ id: string }[]>`
    insert into categories (household_id, parent_id, name, kind, sort_order)
    values (${h}, ${parent.id}, 'Feria', 'expense', 0) returning id`;
  const [tag] = await tx<{ id: string }[]>`
    insert into tags (household_id, name) values (${h}, 'viaje') returning id`;
  const [rule] = await tx<{ id: string }[]>`
    insert into recurring_rules
      (household_id, type, account_id, category_id, amount_minor, currency, merchant,
       frequency, start_date, next_run_on, created_by)
    values (${h}, 'expense', ${acc1.id}, ${child.id}, -35000, 'CLP', 'Gimnasio',
       'monthly', '2026-01-05', '2026-11-05', ${userId}) returning id`;
  await tx`insert into categorization_rules (household_id, pattern, category_id)
    values (${h}, 'jumbo', ${parent.id})`;
  await tx`insert into budgets (household_id, category_id, month, amount_minor, currency, rollover)
    values (${h}, ${parent.id}, '2026-10-01', 300000, 'CLP', true)`;
  await tx`insert into budget_totals (household_id, month, amount_minor, currency)
    values (${h}, '2026-10-01', 900000, 'CLP')`;
  const [goal] = await tx<{ id: string }[]>`
    insert into goals (household_id, name, target_minor, currency, target_date)
    values (${h}, 'Vacaciones', 1000000, 'CLP', '2027-01-31') returning id`;
  await tx`insert into goal_contributions (household_id, goal_id, amount_minor, occurred_on)
    values (${h}, ${goal.id}, 50000, '2026-09-01')`;
  const [t1] = await tx<{ id: string }[]>`
    insert into transactions
      (household_id, account_id, category_id, type, amount_minor, currency, fx_rate, occurred_on, merchant, notes, recurring_rule_id, created_by)
    values (${h}, ${acc1.id}, ${child.id}, 'expense', -12345, 'USD', 959.39, '2026-09-10', 'Tienda', 'nota', ${rule.id}, ${userId})
    returning id`;
  const [t2] = await tx<{ id: string }[]>`
    insert into transactions (household_id, account_id, type, amount_minor, currency, occurred_on, created_by)
    values (${h}, ${acc1.id}, 'transfer', -50000, 'CLP', '2026-09-11', ${userId}) returning id`;
  const [t3] = await tx<{ id: string }[]>`
    insert into transactions (household_id, account_id, type, amount_minor, currency, occurred_on, created_by)
    values (${h}, ${acc2.id}, 'transfer', 50000, 'CLP', '2026-09-11', ${userId}) returning id`;
  await tx`insert into transaction_tags (transaction_id, tag_id) values (${t1.id}, ${tag.id})`;
  await tx`insert into transfers (household_id, from_transaction_id, to_transaction_id)
    values (${h}, ${t2.id}, ${t3.id})`;
  await tx`insert into installment_plans
    (household_id, account_id, transaction_id, installments_count, total_minor, first_due_date, due_day)
    values (${h}, ${acc2.id}, ${t3.id}, 6, 50000, '2026-10-25', 25)`;
  const [loan] = await tx<{ id: string }[]>`insert into loans
    (household_id, name, principal_minor, currency, installments_count, installment_minor, first_due_date)
    values (${h}, 'Consumo', 5000000, 'CLP', 24, 249620, '2026-10-05') returning id`;
  await tx`insert into loan_prepayments (household_id, loan_id, paid_on, amount_minor, mode)
    values (${h}, ${loan.id}, '2026-12-01', 1000000, 'reduce_installment')`;
  await tx`insert into personal_debts (household_id, person, direction, amount_minor, currency, occurred_on)
    values (${h}, 'Ana', 'lent', 20000, 'CLP', '2026-08-01')`;
  const [holding] = await tx<{ id: string }[]>`
    insert into holdings (household_id, name, kind, currency, valuation_method, asset_code)
    values (${h}, 'Dolares', 'foreign_currency', 'CLP', 'fx', 'USD') returning id`;
  await tx`insert into holding_flows (household_id, holding_id, occurred_on, amount_minor, units)
    values (${h}, ${holding.id}, '2026-05-01', 1400000, 1500.12345678)`;
  await tx`insert into holding_valuations (household_id, holding_id, valued_on, value_minor, unit_price, source)
    values (${h}, ${holding.id}, '2026-09-30', 1440000, 959.390000, 'coingecko')`;
  await tx`insert into holdings
      (household_id, name, kind, currency, valuation_method, term_start, term_end, rate_percent, rate_period)
    values (${h}, 'DAP', 'fixed_term_deposit', 'CLP', 'fixed_term', '2026-09-01', '2026-12-01', 0.4500, 'monthly')`;
}

async function scenario(tx: Tx): Promise<Result> {
  // Imports tardios: `@/db` exige DATABASE_URL al cargarse.
  const { parseBackup, prepareRestore, BACKUP_TABLES } = await import("@/lib/backup");
  const { restoreInTransaction } = await import("@/server/backup/restore");

  await tx`reset role`;
  const source = await newUser(tx, "rs-origen");
  const target = await newUser(tx, "rs-destino");

  await seed(tx, source.householdId, source.userId);
  // El destino ya tiene datos propios, que la restauracion debe reemplazar.
  await tx`insert into accounts (household_id, name, type) values (${target.householdId}, 'Vieja', 'cash')`;

  const sourceCounts = await countAll(tx, source.householdId);
  const targetCountsBefore = await countAll(tx, target.householdId);

  // Exporta como PostgREST: to_jsonb (bigint -> numero, fechas -> texto).
  const data: Record<string, unknown[]> = {};
  for (const spec of BACKUP_TABLES) {
    if (spec.hasHousehold === false) {
      const rows = await tx<{ j: unknown }[]>`
        select to_jsonb(tt) as j from transaction_tags tt
        where tt.transaction_id in (select id from transactions where household_id = ${source.householdId})`;
      data[spec.table] = rows.map((r) => r.j);
    } else {
      const rows = await tx<{ j: unknown }[]>`
        select to_jsonb(t) as j from ${tx(spec.table)} t where t.household_id = ${source.householdId}`;
      data[spec.table] = rows.map((r) => r.j);
    }
  }
  const json = JSON.parse(
    JSON.stringify({
      app: "Fintra",
      version: 2,
      profile: { displayCurrency: "USD" },
      data,
    }),
  );
  const parsed = parseBackup(json);
  if (!parsed.ok) throw new Error(parsed.error);

  const prepared = prepareRestore(parsed.backup, {
    userId: target.userId,
    householdId: target.householdId,
  });
  await restoreInTransaction(tx, prepared, target.householdId, "USD", target.userId);

  const targetCountsAfter = await countAll(tx, target.householdId);

  // Toda referencia del destino apunta a filas del destino.
  const [{ n: foreignRefs }] = await tx<{ n: number }[]>`
    select (
      (select count(*) from transactions t join accounts a on a.id = t.account_id
        where t.household_id = ${target.householdId} and a.household_id <> ${target.householdId})
    + (select count(*) from transactions t join categories c on c.id = t.category_id
        where t.household_id = ${target.householdId} and c.household_id <> ${target.householdId})
    + (select count(*) from transfers tr join transactions t on t.id = tr.from_transaction_id
        where tr.household_id = ${target.householdId} and t.household_id <> ${target.householdId})
    + (select count(*) from holding_flows f join holdings h on h.id = f.holding_id
        where f.household_id = ${target.householdId} and h.household_id <> ${target.householdId})
    + (select count(*) from installment_plans p join transactions t on t.id = p.transaction_id
        where p.household_id = ${target.householdId} and t.household_id <> ${target.householdId})
    )::int as n`;

  const [{ a: txTotalSource, b: txTotalTarget }] = await tx<{ a: string; b: string }[]>`
    select
      (select coalesce(sum(amount_minor),0)::text from transactions where household_id = ${source.householdId}) as a,
      (select coalesce(sum(amount_minor),0)::text from transactions where household_id = ${target.householdId}) as b`;

  const [{ n: tagLinksAfter }] = await tx<{ n: number }[]>`
    select count(*)::int as n from transaction_tags tt
    join transactions t on t.id = tt.transaction_id where t.household_id = ${target.householdId}`;

  const [{ linked }] = await tx<{ linked: boolean }[]>`
    select exists (
      select 1 from categories c join categories p on p.id = c.parent_id
      where c.household_id = ${target.householdId} and c.name = 'Feria'
        and p.name = 'Supermercado' and p.household_id = ${target.householdId}
    ) as linked`;

  const [{ display_currency }] = await tx<{ display_currency: string }[]>`
    select display_currency from profiles where id = ${target.userId}`;

  // Las columnas nuevas (unidades, precio, plazo, tasa) viajan completas.
  const columnsOf = async (householdId: string) => {
    const [row] = await tx<{ s: string }[]>`
      select (
        (select string_agg(h.name || ':' || h.valuation_method || ':' || coalesce(h.asset_code, '-') || ':' ||
           coalesce(h.term_end::text, '-') || ':' || coalesce(h.rate_percent::text, '-') || ':' || coalesce(h.rate_period, '-'),
           '|' order by h.name) from holdings h where h.household_id = ${householdId})
        || '#' ||
        (select string_agg(f.units::text, ',' order by f.units) from holding_flows f where f.household_id = ${householdId})
        || '#' ||
        (select string_agg(v.unit_price::text || ':' || v.source, ',') from holding_valuations v where v.household_id = ${householdId})
      ) as s`;
    return row.s;
  };
  const holdingColumns = {
    source: await columnsOf(source.householdId),
    target: await columnsOf(target.householdId),
  };

  return {
    counts: prepared.counts,
    sourceCounts,
    targetCountsBefore,
    targetCountsAfter,
    dropped: prepared.dropped,
    foreignRefs,
    txTotalSource,
    txTotalTarget,
    tagLinksAfter,
    categoryParentLinked: linked,
    profileCurrency: display_currency,
    holdingColumns,
  };
}

describe.skipIf(!url)("restaurar respaldo contra el esquema real (con rollback)", () => {
  let result: Result;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(url!, { prepare: false, max: 1 });
    try {
      await sql.begin(async (tx) => {
        result = await scenario(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }, 90_000);

  afterAll(async () => {
    await sql?.end();
  });

  it("el control no es vacuo: el origen tiene filas en todas las tablas", () => {
    const empty = Object.entries(result.sourceCounts).filter(([, n]) => n === 0);
    expect(empty).toEqual([]);
  });

  it("el destino reemplaza lo que tenia (la cuenta vieja desaparece)", () => {
    expect(result.targetCountsBefore.accounts).toBe(1);
    expect(result.targetCountsAfter.accounts).toBe(2);
  });

  it("el destino queda con las mismas filas que el origen, en todas las tablas", () => {
    expect(result.targetCountsAfter).toEqual(result.sourceCounts);
  });

  it("no descarta ninguna fila de un respaldo consistente", () => {
    expect(result.dropped).toBe(0);
  });

  it("los montos suman igual (sin perdida de precision)", () => {
    expect(result.txTotalTarget).toBe(result.txTotalSource);
  });

  it("las referencias del destino apuntan a filas del destino", () => {
    expect(result.foreignRefs).toBe(0);
  });

  it("conserva etiquetas de movimientos y la jerarquia de categorias", () => {
    expect(result.tagLinksAfter).toBe(1);
    expect(result.categoryParentLinked).toBe(true);
  });

  it("conserva unidades, precios, fuente y condiciones de plazo con todos sus decimales", () => {
    expect(result.holdingColumns.target).toBe(result.holdingColumns.source);
    expect(result.holdingColumns.target).toContain("1500.12345678");
    expect(result.holdingColumns.target).toContain("959.390000:coingecko");
    expect(result.holdingColumns.target).toContain(
      "DAP:fixed_term:-:2026-12-01:0.4500:monthly",
    );
  });

  it("aplica la moneda de visualizacion del respaldo", () => {
    expect(result.profileCurrency).toBe("USD");
  });
});
