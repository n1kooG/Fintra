import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/lib/supabase/types";
import type { Currency } from "@/lib/money";
import { breakdownByCategory, summarize, type ReportTransaction } from "@/lib/reports";
import { RateBook } from "@/lib/fx";
import { loadRateBook } from "@/server/fx/rates";
import { fetchAll } from "./paginate";
import { getCategoryLabelMap } from "./categories";
import { withCategoryLabels } from "@/lib/categories";

export type TransactionWithRelations = {
  id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount_minor: string;
  currency: Currency;
  fx_rate: string | null;
  occurred_on: string;
  merchant: string | null;
  notes: string | null;
  created_at: string;
  recurring_rule_id: string | null;
  account: { id: string; name: string; currency: string } | null;
  category: { id: string; name: string } | null;
  /** Etiquetas del movimiento (la union transaction_tags con su etiqueta embebida). */
  transaction_tags: { tag: { id: string; name: string } | null }[];
};

export type TransactionFilters = {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType | "all";
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
  search?: string;
  /** Solo movimientos con esta etiqueta (id). */
  tagId?: string;
  limit?: number;
};

/** Cuantos movimientos muestra cada pagina del listado. */
export const TRANSACTIONS_PAGE_SIZE = 50;

/** Lo minimo de un query builder de PostgREST que usan los filtros. */
type Filterable = {
  eq(column: string, value: string): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
  or(filters: string): Filterable;
};

/**
 * Aplica los filtros del listado a una consulta de `transactions`. Es la
 * unica definicion de "que coincide", asi la pagina visible y el resumen
 * del periodo siempre hablan del mismo conjunto de filas. (Tipada de
 * forma estructural: los tipos genericos de PostgREST son demasiado
 * profundos para pasarlos por un parametro generico.)
 */
function applyFilters<Q>(query: Q, filters: TransactionFilters): Q {
  let q = query as unknown as Filterable;
  if (filters.accountId) q = q.eq("account_id", filters.accountId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (filters.type && filters.type !== "all") q = q.eq("type", filters.type);
  if (filters.from) q = q.gte("occurred_on", filters.from);
  if (filters.to) q = q.lte("occurred_on", filters.to);
  if (filters.tagId) q = q.eq("tag_filter.tag_id", filters.tagId);
  if (filters.search) {
    // Va dentro de un filtro .or() de PostgREST: se dejan solo letras,
    // numeros y puntuacion inocua, para que comas o parentesis del
    // usuario no alteren la consulta.
    const term = filters.search.replace(/[^\p{L}\p{N}\s.&'-]/gu, " ").trim();
    if (term) q = q.or(`merchant.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  return q as unknown as Q;
}

const TRANSACTION_COLUMNS =
  "id, account_id, category_id, type, amount_minor, currency, fx_rate, occurred_on, merchant, notes, created_at, recurring_rule_id, account:accounts(id, name, currency), category:categories(id, name), transaction_tags(tag:tags(id, name))";

/**
 * Con filtro por etiqueta hace falta un INNER JOIN a la union (si no, el
 * filtro solo ocultaria la etiqueta y devolveria igual todos los movimientos).
 * Se pide aparte de la columna normal de etiquetas, con alias, para poder
 * seguir mostrando TODAS las etiquetas de cada movimiento encontrado.
 */
function columnsFor(filters: TransactionFilters) {
  return filters.tagId
    ? `${TRANSACTION_COLUMNS}, tag_filter:transaction_tags!inner(tag_id)`
    : TRANSACTION_COLUMNS;
}

/**
 * Trae movimientos con la cuenta y la categoria embebidas (para no tener
 * que resolverlas aparte en cada fila de la UI). Ordenados del mas
 * reciente al mas antiguo. Con `limit` devuelve solo los primeros; para
 * un listado completo y paginable usar `getTransactionsPage`.
 */
export async function getTransactions(
  householdId: string,
  filters: TransactionFilters = {},
): Promise<TransactionWithRelations[]> {
  const supabase = await createClient();

  let query = applyFilters(
    supabase
      .from("transactions")
      .select(columnsFor(filters))
      .eq("household_id", householdId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    filters,
  );
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TransactionWithRelations[];
}

/**
 * Una pagina del listado de movimientos mas el total exacto de filas que
 * cumplen los filtros. El desempate por `id` mantiene estable el orden
 * entre paginas cuando varios movimientos comparten fecha y hora.
 */
export async function getTransactionsPage(
  householdId: string,
  filters: TransactionFilters,
  offset: number,
  size: number = TRANSACTIONS_PAGE_SIZE,
): Promise<{ rows: TransactionWithRelations[]; total: number }> {
  const supabase = await createClient();

  const { data, error, count } = await applyFilters(
    supabase
      .from("transactions")
      .select(columnsFor(filters), { count: "exact" })
      .eq("household_id", householdId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    filters,
  ).range(offset, offset + size - 1);

  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as TransactionWithRelations[],
    total: count ?? 0,
  };
}

type SummaryRow = Pick<
  ReportTransaction,
  "type" | "amount_minor" | "currency" | "fx_rate" | "occurred_on"
>;

/**
 * Resumen de TODO lo que cumple los filtros (no solo de la pagina
 * visible), consolidado en la moneda de visualizacion. Lee solo las
 * columnas que hacen falta y pagina por debajo del tope de 1.000 filas.
 */
export async function getFilteredSummary(
  householdId: string,
  filters: TransactionFilters,
  displayCurrency: Currency,
) {
  const supabase = await createClient();

  const rows = await fetchAll<SummaryRow>((from, to) =>
    applyFilters(
      supabase
        .from("transactions")
        .select(
          filters.tagId
            ? "type, amount_minor, currency, fx_rate, occurred_on, tag_filter:transaction_tags!inner(tag_id)"
            : "type, amount_minor, currency, fx_rate, occurred_on",
        )
        .eq("household_id", householdId)
        .order("id"),
      filters,
    ).range(from, to),
  );

  if (rows.length === 0) {
    return { summary: summarize([], displayCurrency, new RateBook([])), count: 0 };
  }

  let from = rows[0].occurred_on;
  let to = from;
  for (const r of rows) {
    if (r.occurred_on < from) from = r.occurred_on;
    if (r.occurred_on > to) to = r.occurred_on;
  }
  const book = await loadRateBook(supabase, from, to);
  return { summary: summarize(rows, displayCurrency, book), count: rows.length };
}

export async function getTransactionById(householdId: string, transactionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, account_id, category_id, type, amount_minor, currency, occurred_on, merchant, notes, transaction_tags(tag:tags(name))",
    )
    .eq("household_id", householdId)
    .eq("id", transactionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { transaction_tags, ...rest } = data as unknown as Omit<
    typeof data,
    "transaction_tags"
  > & {
    transaction_tags: { tag: { name: string } | null }[];
  };
  return {
    ...rest,
    tags: (transaction_tags ?? []).flatMap((l) => (l.tag ? [l.tag.name] : [])),
  };
}

export async function getRecentTransactions(householdId: string, limit = 5) {
  return getTransactions(householdId, { limit });
}

/** Primer y ultimo dia de un mes como "yyyy-mm-dd". */
export function monthRange(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Resumen del mes (ingresos, gastos, balance) y gasto por categoria,
 * consolidados en la moneda de visualizacion con la cotizacion de la
 * fecha de cada movimiento (ver src/lib/reports.ts). Una sola consulta
 * de movimientos para ambos.
 */
export async function getMonthReport(
  householdId: string,
  year: number,
  month: number,
  displayCurrency: Currency,
) {
  const { from, to } = monthRange(year, month);
  const supabase = await createClient();

  const [rawRows, book, labels] = await Promise.all([
    fetchAll<ReportTransaction>((a, b) =>
      supabase
        .from("transactions")
        .select(
          "type, amount_minor, currency, fx_rate, occurred_on, category_id, category:categories(id, name)",
        )
        .eq("household_id", householdId)
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("id")
        .range(a, b),
    ),
    loadRateBook(supabase, from, to),
    getCategoryLabelMap(householdId),
  ]);
  const rows = withCategoryLabels(rawRows, labels);

  const summary = summarize(rows, displayCurrency, book);
  const breakdown = breakdownByCategory(rows, displayCurrency, book);
  return {
    summary,
    breakdown: breakdown.rows,
    unconverted: summary.unconverted,
  };
}
