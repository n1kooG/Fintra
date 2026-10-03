/**
 * Formato del respaldo y logica pura para restaurarlo (sin base de datos,
 * para poder probarla). La restauracion REEMPLAZA los datos del hogar:
 * todas las filas reciben ids nuevos (asi un respaldo de otra cuenta, o el
 * mismo hogar tras un borrado, nunca choca con filas existentes) y las
 * referencias entre tablas se reescriben al nuevo id.
 */

/** v1: sin etiquetas de movimientos. v2 agrega `transaction_tags`. */
export const BACKUP_VERSION = 2;
export const BACKUP_APP = "Fintra";

export type ForeignKey = { to: string; required: boolean };
export type BackupTable = {
  table: string;
  /** columna -> tabla a la que apunta (dentro del respaldo). */
  fks: Record<string, ForeignKey>;
  /** `false` en tablas de union sin columna `id` (transaction_tags). */
  hasId?: boolean;
  /** `false` en tablas sin `household_id` propio (transaction_tags). */
  hasHousehold?: boolean;
};

/**
 * Tablas del respaldo, en orden de insercion (cada tabla va despues de
 * las que referencia). Si se agrega una tabla con `household_id` o una
 * clave foranea nueva al esquema, hay que declararla aqui: un test
 * compara esta lista contra el esquema de Drizzle y falla si se olvida.
 */
export const BACKUP_TABLES: BackupTable[] = [
  { table: "accounts", fks: {} },
  { table: "categories", fks: { parent_id: { to: "categories", required: false } } },
  { table: "tags", fks: {} },
  {
    table: "recurring_rules",
    fks: {
      account_id: { to: "accounts", required: true },
      category_id: { to: "categories", required: false },
    },
  },
  {
    table: "categorization_rules",
    fks: { category_id: { to: "categories", required: true } },
  },
  { table: "budgets", fks: { category_id: { to: "categories", required: true } } },
  { table: "budget_totals", fks: {} },
  { table: "goals", fks: {} },
  {
    table: "goal_contributions",
    fks: { goal_id: { to: "goals", required: true } },
  },
  {
    table: "transactions",
    fks: {
      account_id: { to: "accounts", required: true },
      category_id: { to: "categories", required: false },
      recurring_rule_id: { to: "recurring_rules", required: false },
    },
  },
  {
    table: "transaction_tags",
    hasId: false,
    hasHousehold: false,
    fks: {
      transaction_id: { to: "transactions", required: true },
      tag_id: { to: "tags", required: true },
    },
  },
  {
    table: "transfers",
    fks: {
      from_transaction_id: { to: "transactions", required: true },
      to_transaction_id: { to: "transactions", required: true },
    },
  },
  {
    table: "installment_plans",
    fks: {
      account_id: { to: "accounts", required: true },
      transaction_id: { to: "transactions", required: true },
    },
  },
  { table: "loans", fks: {} },
  {
    table: "loan_prepayments",
    fks: { loan_id: { to: "loans", required: true } },
  },
  { table: "personal_debts", fks: {} },
  { table: "holdings", fks: {} },
  {
    table: "holding_flows",
    fks: { holding_id: { to: "holdings", required: true } },
  },
  {
    table: "holding_valuations",
    fks: { holding_id: { to: "holdings", required: true } },
  },
];

export type Row = Record<string, unknown>;

export type Backup = {
  app: string;
  version: number;
  exportedAt?: string;
  profile?: { displayName?: string; displayCurrency?: string };
  data: Record<string, Row[]>;
};

/** Tope de seguridad: un respaldo personal real queda muy por debajo. */
export const MAX_BACKUP_ROWS = 500_000;

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valida la forma del JSON de un respaldo antes de tocar la base. */
export function parseBackup(input: unknown): ParseResult {
  if (!isPlainObject(input) || input.app !== BACKUP_APP) {
    return { ok: false, error: "Este archivo no es un respaldo de Fintra." };
  }
  const version = input.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "El respaldo no indica su versión." };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: "Este respaldo viene de una versión más nueva de Fintra. Actualiza la app.",
    };
  }
  if (!isPlainObject(input.data)) {
    return { ok: false, error: "El respaldo no trae datos." };
  }

  const data: Record<string, Row[]> = {};
  let total = 0;
  for (const spec of BACKUP_TABLES) {
    const rows = input.data[spec.table];
    if (rows === undefined) continue; // respaldos v1 no traen transaction_tags
    if (!Array.isArray(rows) || !rows.every(isPlainObject)) {
      return { ok: false, error: `La tabla «${spec.table}» del respaldo está dañada.` };
    }
    total += rows.length;
    if (total > MAX_BACKUP_ROWS) {
      return { ok: false, error: "El respaldo es demasiado grande para restaurarlo." };
    }
    data[spec.table] = rows;
  }

  const profile = isPlainObject(input.profile)
    ? {
        displayName:
          typeof input.profile.displayName === "string"
            ? input.profile.displayName
            : undefined,
        displayCurrency:
          typeof input.profile.displayCurrency === "string"
            ? input.profile.displayCurrency
            : undefined,
      }
    : undefined;

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version,
      exportedAt: typeof input.exportedAt === "string" ? input.exportedAt : undefined,
      profile,
      data,
    },
  };
}

export type PreparedRestore = {
  /** En orden de insercion; las tablas vacias no aparecen. */
  tables: { table: string; rows: Row[] }[];
  /** Filas que se van a insertar por tabla. */
  counts: Record<string, number>;
  /** Filas descartadas por referenciar algo que no esta en el respaldo. */
  dropped: number;
};

type PrepareContext = {
  userId: string;
  householdId: string;
  /** Generador de ids; inyectable para probar de forma determinista. */
  newId?: () => string;
};

/**
 * Reescribe el respaldo para insertarlo en `householdId`: ids nuevos,
 * claves foraneas remapeadas, `household_id` y `created_by` propios. Una
 * fila cuya referencia obligatoria no existe en el respaldo se descarta
 * (y con ella lo que dependa de ella); una referencia opcional rota queda
 * en null. Las categorias se ordenan padre antes que hijo.
 */
export function prepareRestore(backup: Backup, ctx: PrepareContext): PreparedRestore {
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const idMaps = new Map<string, Map<string, string>>();
  const tables: PreparedRestore["tables"] = [];
  const counts: Record<string, number> = {};
  let dropped = 0;

  for (const spec of BACKUP_TABLES) {
    const source = backup.data[spec.table] ?? [];
    const ownMap = new Map<string, string>();
    idMaps.set(spec.table, ownMap);

    // Fase 1: todos los ids nuevos de la tabla, ANTES de resolver
    // referencias. Una categoria hija puede venir antes que su padre en el
    // archivo; si se resolviera en una sola pasada, su parent_id quedaria
    // en null.
    const candidates: { original: Row; row: Row }[] = [];
    for (const original of source) {
      const row: Row = { ...original };
      if (spec.hasId !== false) {
        const oldId = original.id;
        if (typeof oldId !== "string" || oldId === "") {
          dropped++;
          continue;
        }
        const id = newId();
        ownMap.set(oldId, id);
        row.id = id;
      }
      candidates.push({ original, row });
    }

    // Fase 2: hogar, usuario y claves foraneas.
    const rows: Row[] = [];
    const seenPairs = new Set<string>();
    for (const { original, row } of candidates) {
      if (spec.hasHousehold !== false) row.household_id = ctx.householdId;
      if ("created_by" in row) row.created_by = ctx.userId;

      let keep = true;
      for (const [column, fk] of Object.entries(spec.fks)) {
        const value = original[column];
        const mapped =
          typeof value === "string" ? idMaps.get(fk.to)?.get(value) : undefined;
        if (mapped === undefined) {
          if (fk.required) keep = false;
          row[column] = null;
        } else {
          row[column] = mapped;
        }
      }
      if (!keep) {
        // Si descartamos la fila, su id nuevo ya no debe resolverse.
        if (spec.hasId !== false) ownMap.delete(String(original.id));
        dropped++;
        continue;
      }

      if (spec.hasId === false) {
        const key = Object.keys(spec.fks)
          .map((c) => String(row[c]))
          .join("|");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
      }
      rows.push(row);
    }

    const ordered = spec.table === "categories" ? parentsFirst(rows) : rows;
    if (ordered.length > 0) {
      tables.push({ table: spec.table, rows: ordered });
      counts[spec.table] = ordered.length;
    }
  }

  return { tables, counts, dropped };
}

/**
 * Ordena categorias para que cada padre se inserte antes que sus hijos.
 * Un ciclo (dato corrupto) se corta dejando `parent_id` en null.
 */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const depth = new Map<string, number>();

  function depthOf(row: Row, trail: Set<string>): number {
    const id = String(row.id);
    const known = depth.get(id);
    if (known !== undefined) return known;
    const parentId = row.parent_id;
    let d = 0;
    if (typeof parentId === "string") {
      const parent = byId.get(parentId);
      if (parent && !trail.has(parentId)) {
        trail.add(id);
        d = depthOf(parent, trail) + 1;
      } else {
        row.parent_id = null;
      }
    }
    depth.set(id, d);
    return d;
  }

  for (const row of rows) depthOf(row, new Set());
  return [...rows].sort((a, b) => depth.get(String(a.id))! - depth.get(String(b.id))!);
}
