import { describe, expect, it } from "vitest";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  parseBackup,
  prepareRestore,
  type Backup,
} from "./backup";

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

const ctx = { userId: "user-X", householdId: "house-X" };

function makeBackup(data: Backup["data"]): Backup {
  return { app: "Fintra", version: BACKUP_VERSION, data };
}

describe("BACKUP_TABLES frente al esquema de Drizzle", () => {
  const isTable = (v: unknown): v is PgTable => is(v, PgTable);
  const tables = Object.values(schema as Record<string, unknown>).filter(isTable);
  const configs = tables.map((t) => getTableConfig(t));

  // Tablas con household_id que NO viajan en el respaldo: pertenecen a
  // un dispositivo o a la operacion del servidor, no a los datos del usuario.
  const EXCLUDED = new Set([
    "push_subscriptions",
    "notification_log",
    "household_members",
    "profiles",
    "household_invitations",
  ]);

  it("incluye todas las tablas de datos del hogar", () => {
    const inBackup = new Set(BACKUP_TABLES.map((t) => t.table));
    const missing = configs
      .filter((c) => c.columns.some((col) => col.name === "household_id"))
      .map((c) => c.name)
      .filter((name) => !EXCLUDED.has(name) && !inBackup.has(name));
    expect(missing).toEqual([]);
  });

  it("no lista tablas que no existen", () => {
    const names = new Set(configs.map((c) => c.name));
    expect(BACKUP_TABLES.map((t) => t.table).filter((t) => !names.has(t))).toEqual([]);
  });

  it("declara todas las claves foraneas entre tablas, con su obligatoriedad", () => {
    for (const spec of BACKUP_TABLES) {
      const config = configs.find((c) => c.name === spec.table)!;
      const expected: Record<string, { to: string; required: boolean }> = {};
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const target = getTableConfig(ref.foreignTable).name;
        if (target === "households") continue;
        const column = ref.columns[0];
        expected[column.name] = { to: target, required: column.notNull };
      }
      expect({ table: spec.table, fks: spec.fks }).toEqual({
        table: spec.table,
        fks: expected,
      });
    }
  });

  it("cada tabla va despues de las que referencia", () => {
    const position = new Map(BACKUP_TABLES.map((t, i) => [t.table, i]));
    for (const spec of BACKUP_TABLES) {
      for (const fk of Object.values(spec.fks)) {
        if (fk.to === spec.table) continue; // autorreferencia (categories)
        expect(position.get(fk.to)!).toBeLessThan(position.get(spec.table)!);
      }
    }
  });
});

describe("parseBackup", () => {
  it("acepta un respaldo valido", () => {
    const r = parseBackup({
      app: "Fintra",
      version: 2,
      data: { accounts: [{ id: "a" }] },
    });
    expect(r.ok).toBe(true);
  });

  it("acepta respaldos v1 (sin transaction_tags)", () => {
    expect(parseBackup({ app: "Fintra", version: 1, data: { accounts: [] } }).ok).toBe(
      true,
    );
  });

  it("rechaza archivos que no son de Fintra", () => {
    expect(parseBackup({ app: "Otra", version: 1, data: {} }).ok).toBe(false);
    expect(parseBackup([]).ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
  });

  it("rechaza versiones futuras", () => {
    const r = parseBackup({ app: "Fintra", version: BACKUP_VERSION + 1, data: {} });
    expect(r.ok).toBe(false);
  });

  it("rechaza tablas que no son listas de objetos", () => {
    expect(parseBackup({ app: "Fintra", version: 2, data: { accounts: "x" } }).ok).toBe(
      false,
    );
    expect(
      parseBackup({ app: "Fintra", version: 2, data: { accounts: [1, 2] } }).ok,
    ).toBe(false);
  });

  it("ignora tablas desconocidas en vez de insertarlas", () => {
    const r = parseBackup({
      app: "Fintra",
      version: 2,
      data: { accounts: [], pg_authid: [{ id: "x" }] },
    });
    expect(r.ok && Object.keys(r.backup.data)).toEqual(["accounts"]);
  });
});

describe("prepareRestore", () => {
  const backup = makeBackup({
    accounts: [{ id: "acc-1", household_id: "OLD", name: "Cuenta" }],
    categories: [
      { id: "cat-child", household_id: "OLD", parent_id: "cat-root", name: "Hijo" },
      { id: "cat-root", household_id: "OLD", parent_id: null, name: "Raiz" },
    ],
    tags: [{ id: "tag-1", household_id: "OLD", name: "viaje" }],
    transactions: [
      {
        id: "tx-1",
        household_id: "OLD",
        account_id: "acc-1",
        category_id: "cat-root",
        created_by: "someone-else",
        amount_minor: -5000,
      },
    ],
    transaction_tags: [
      { transaction_id: "tx-1", tag_id: "tag-1" },
      { transaction_id: "tx-1", tag_id: "tag-1" },
    ],
  });

  const out = prepareRestore(backup, { ...ctx, newId: counter() });
  const rows = (table: string) => out.tables.find((t) => t.table === table)?.rows ?? [];

  it("asigna ids nuevos y el hogar y usuario de destino", () => {
    const account = rows("accounts")[0];
    expect(account.id).toMatch(/^new-/);
    expect(account.id).not.toBe("acc-1");
    expect(account.household_id).toBe("house-X");
    expect(rows("transactions")[0].created_by).toBe("user-X");
  });

  it("reescribe las claves foraneas a los ids nuevos", () => {
    const account = rows("accounts")[0];
    const root = rows("categories").find((c) => c.name === "Raiz")!;
    const tx = rows("transactions")[0];
    expect(tx.account_id).toBe(account.id);
    expect(tx.category_id).toBe(root.id);
  });

  it("inserta cada categoria padre antes que sus hijos", () => {
    const names = rows("categories").map((c) => c.name);
    expect(names).toEqual(["Raiz", "Hijo"]);
    const [root, child] = rows("categories");
    expect(child.parent_id).toBe(root.id);
  });

  it("deduplica las etiquetas de un movimiento y las enlaza a ids nuevos", () => {
    const links = rows("transaction_tags");
    expect(links).toHaveLength(1);
    expect(links[0].transaction_id).toBe(rows("transactions")[0].id);
    expect(links[0].tag_id).toBe(rows("tags")[0].id);
    expect(links[0]).not.toHaveProperty("household_id");
  });

  it("cuenta las filas por tabla", () => {
    expect(out.counts).toMatchObject({ accounts: 1, categories: 2, transactions: 1 });
    expect(out.dropped).toBe(0);
  });

  it("descarta lo que depende de una cuenta ausente, en cascada", () => {
    const broken = makeBackup({
      accounts: [],
      transactions: [
        { id: "tx-1", account_id: "ghost", amount_minor: 1 },
        { id: "tx-2", account_id: "ghost", amount_minor: 2 },
      ],
      transfers: [{ id: "tr-1", from_transaction_id: "tx-1", to_transaction_id: "tx-2" }],
    });
    const result = prepareRestore(broken, { ...ctx, newId: counter() });
    expect(result.tables).toEqual([]);
    expect(result.dropped).toBe(3);
  });

  it("deja en null una referencia opcional rota en vez de descartar la fila", () => {
    const partial = makeBackup({
      accounts: [{ id: "acc-1" }],
      transactions: [{ id: "tx-1", account_id: "acc-1", category_id: "ghost" }],
    });
    const result = prepareRestore(partial, { ...ctx, newId: counter() });
    const tx = result.tables.find((t) => t.table === "transactions")!.rows[0];
    expect(tx.category_id).toBeNull();
    expect(result.dropped).toBe(0);
  });

  it("corta ciclos de categorias en vez de colgarse", () => {
    const cyc = makeBackup({
      categories: [
        { id: "a", parent_id: "b", name: "A" },
        { id: "b", parent_id: "a", name: "B" },
      ],
    });
    const result = prepareRestore(cyc, { ...ctx, newId: counter() });
    const cats = result.tables.find((t) => t.table === "categories")!.rows;
    expect(cats).toHaveLength(2);
    expect(cats.filter((c) => c.parent_id === null).length).toBeGreaterThanOrEqual(1);
  });

  it("descarta filas sin id", () => {
    const result = prepareRestore(makeBackup({ accounts: [{ name: "sin id" }] }), {
      ...ctx,
      newId: counter(),
    });
    expect(result.tables).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("no deja pasar el household_id del archivo", () => {
    const evil = makeBackup({ accounts: [{ id: "a", household_id: "VICTIMA" }] });
    const result = prepareRestore(evil, { ...ctx, newId: counter() });
    expect(result.tables[0].rows[0].household_id).toBe("house-X");
  });
});
