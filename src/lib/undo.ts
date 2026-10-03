/**
 * «Deshacer» tras eliminar movimientos. Al borrar, el servidor devuelve una
 * copia de lo que se fue (movimientos, el enlace de la transferencia, el plan
 * de cuotas y las etiquetas); si la persona pulsa «Deshacer», el cliente la
 * manda de vuelta y se vuelve a insertar con los mismos ids.
 *
 * Como esa copia viaja por el cliente, NO se confia en ella: cada fila se
 * valida de forma estricta (solo columnas conocidas, uuids y fechas bien
 * formados) y el servidor fuerza el hogar y el autor, y comprueba que las
 * cuentas y categorias a las que apunta sean del hogar.
 */
import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bigintString = z.string().regex(/^-?\d{1,19}$/);
const timestamp = z.string().min(10).max(40);

const transactionRow = z.strictObject({
  id: uuid,
  account_id: uuid,
  category_id: uuid.nullable(),
  type: z.enum(["income", "expense", "transfer"]),
  amount_minor: bigintString,
  currency: z.enum(["CLP", "USD", "EUR", "UF", "UTM"]),
  fx_rate: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/)
    .nullable(),
  occurred_on: isoDate,
  merchant: z.string().max(200).nullable(),
  notes: z.string().max(1000).nullable(),
  recurring_rule_id: uuid.nullable(),
  created_at: timestamp,
});

const transferRow = z.strictObject({
  id: uuid,
  from_transaction_id: uuid,
  to_transaction_id: uuid,
});

const planRow = z.strictObject({
  id: uuid,
  account_id: uuid,
  transaction_id: uuid,
  installments_count: z.number().int().min(2).max(60),
  total_minor: bigintString,
  first_due_date: isoDate,
  due_day: z.number().int().min(1).max(31),
});

const tagLinkRow = z.strictObject({ transaction_id: uuid, tag_id: uuid });

export const deletedSnapshotSchema = z.strictObject({
  transactions: z.array(transactionRow).min(1).max(500),
  transfers: z.array(transferRow).max(500),
  plans: z.array(planRow).max(500),
  tagLinks: z.array(tagLinkRow).max(5000),
});

export type DeletedSnapshot = z.infer<typeof deletedSnapshotSchema>;

export type SnapshotCheck =
  { ok: true; snapshot: DeletedSnapshot } | { ok: false; error: string };

/**
 * Valida la forma de la copia y su coherencia interna: las transferencias y
 * planes deben referirse a movimientos que vienen en la misma copia, y las
 * etiquetas a movimientos de la copia.
 */
export function checkSnapshot(input: unknown): SnapshotCheck {
  const parsed = deletedSnapshotSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "La copia para deshacer no es válida." };
  const snapshot = parsed.data;

  const ids = new Set(snapshot.transactions.map((t) => t.id));
  if (ids.size !== snapshot.transactions.length) {
    return { ok: false, error: "La copia para deshacer tiene movimientos repetidos." };
  }
  const dangling =
    snapshot.transfers.some(
      (t) => !ids.has(t.from_transaction_id) || !ids.has(t.to_transaction_id),
    ) ||
    snapshot.plans.some((p) => !ids.has(p.transaction_id)) ||
    snapshot.tagLinks.some((l) => !ids.has(l.transaction_id));
  if (dangling) return { ok: false, error: "La copia para deshacer está incompleta." };

  return { ok: true, snapshot };
}

/** Ids de cuenta y de categoria que la copia necesita que existan en el hogar. */
export function referencedIds(snapshot: DeletedSnapshot) {
  const accounts = new Set<string>();
  const categories = new Set<string>();
  const rules = new Set<string>();
  for (const t of snapshot.transactions) {
    accounts.add(t.account_id);
    if (t.category_id) categories.add(t.category_id);
    if (t.recurring_rule_id) rules.add(t.recurring_rule_id);
  }
  for (const p of snapshot.plans) accounts.add(p.account_id);
  return { accounts: [...accounts], categories: [...categories], rules: [...rules] };
}
