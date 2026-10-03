import "server-only";
import type { TransactionSql } from "postgres";
import { sqlClient } from "@/db";
import { DISPLAY_CURRENCIES } from "@/lib/money";
import { BACKUP_TABLES, type PreparedRestore, type Row } from "@/lib/backup";

/** Filas por INSERT: 300 filas x ~30 columnas queda muy bajo el tope de parametros. */
const CHUNK = 300;

type Sql = TransactionSql;

/**
 * Reemplaza TODOS los datos del hogar por los del respaldo, en una sola
 * transaccion: o queda todo restaurado o no cambia nada.
 */
export async function restoreIntoHousehold(
  prepared: PreparedRestore,
  householdId: string,
  displayCurrency?: string,
  userId?: string,
): Promise<void> {
  await sqlClient.begin((tx) =>
    restoreInTransaction(tx, prepared, householdId, displayCurrency, userId),
  );
}

/**
 * El cuerpo de la restauracion, sobre una transaccion ya abierta (asi la
 * prueba de integracion puede correrlo y revertirlo). Se conecta con el
 * rol dueno (salta RLS), asi que cada sentencia va acotada por el
 * `household_id` del usuario autenticado; el respaldo ya viene reescrito
 * por prepareRestore con ese hogar y sin ids ajenos.
 *
 * Solo se insertan columnas que existen en la tabla (un respaldo de otra
 * version puede traer columnas de mas). Las filas se agrupan por su
 * conjunto de columnas, para no forzar NULL donde la base tiene un default.
 */
export async function restoreInTransaction(
  tx: Sql,
  prepared: PreparedRestore,
  householdId: string,
  displayCurrency?: string,
  userId?: string,
): Promise<void> {
  // Un solo restaurador a la vez por hogar.
  await tx`select pg_advisory_xact_lock(hashtext(${householdId}))`;

  const columnRows = await tx<{ table_name: string; column_name: string }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ${tx(BACKUP_TABLES.map((t) => t.table))}`;
  const valid = new Map<string, Set<string>>();
  for (const { table_name, column_name } of columnRows) {
    const set = valid.get(table_name) ?? new Set<string>();
    set.add(column_name);
    valid.set(table_name, set);
  }

  // Borrar en orden inverso a la insercion. Las tablas sin household_id
  // propio (transaction_tags) caen por la cascada de sus movimientos.
  for (const { table, hasHousehold } of [...BACKUP_TABLES].reverse()) {
    if (hasHousehold === false) continue;
    await tx`delete from ${tx(table)} where household_id = ${householdId}`;
  }

  for (const { table, rows } of prepared.tables) {
    const allowed = valid.get(table);
    if (!allowed) throw new Error(`Tabla desconocida: ${table}`);
    await insertRows(tx, table, rows, allowed);
  }

  if (
    displayCurrency &&
    userId &&
    (DISPLAY_CURRENCIES as readonly string[]).includes(displayCurrency)
  ) {
    await tx`update profiles set display_currency = ${displayCurrency} where id = ${userId}`;
  }
}

async function insertRows(tx: Sql, table: string, rows: Row[], allowed: Set<string>) {
  const groups = new Map<string, { columns: string[]; rows: Row[] }>();
  for (const row of rows) {
    const columns = Object.keys(row)
      .filter((c) => allowed.has(c))
      .sort();
    const key = columns.join(",");
    const group = groups.get(key) ?? { columns, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const { columns, rows: groupRows } of groups.values()) {
    for (let i = 0; i < groupRows.length; i += CHUNK) {
      const chunk = groupRows.slice(i, i + CHUNK).map((row) => {
        const picked: Record<string, string | number | boolean | null> = {};
        for (const c of columns) picked[c] = normalize(row[c]);
        return picked;
      });
      await tx`insert into ${tx(table)} ${tx(chunk, ...columns)}`;
    }
  }
}

/** Las columnas del esquema son escalares; cualquier otra cosa es dato corrupto. */
function normalize(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error("El respaldo trae un valor que no se puede restaurar.");
}
