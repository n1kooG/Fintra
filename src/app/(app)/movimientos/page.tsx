import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccounts } from "@/server/queries/accounts";
import { getCategories } from "@/server/queries/categories";
import { getTags } from "@/server/tags";
import { categoryLabels, orderCategories } from "@/lib/categories";
import {
  getFilteredSummary,
  getTransactionsPage,
  TRANSACTIONS_PAGE_SIZE,
  type TransactionFilters,
} from "@/server/queries/transactions";
import { Amount } from "@/components/money/amount";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import type { Currency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { formatRelativeDay } from "@/lib/dates";
import { pageWindow, parsePageParam } from "@/lib/pagination";
import { DeleteTransactionButton } from "./delete-transaction-button";
import {
  RowCheckbox,
  SelectionBar,
  SelectionProvider,
  SelectionToggle,
} from "./selection";

type SearchParams = {
  cuenta?: string;
  categoria?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  etiqueta?: string;
  pagina?: string;
};

const TYPE_TABS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "income", label: "Ingresos" },
  { value: "expense", label: "Gastos" },
  { value: "transfer", label: "Transferencias" },
];

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const params = await searchParams;

  const [accounts, categories, tags] = await Promise.all([
    getAccounts(current.householdId),
    getCategories(current.householdId),
    getTags(current.householdId),
  ]);
  const labels = categoryLabels(categories);

  const filters: TransactionFilters = {
    accountId: params.cuenta || undefined,
    categoryId: params.categoria || undefined,
    type: (params.tipo as TransactionFilters["type"]) || "all",
    from: params.desde || undefined,
    to: params.hasta || undefined,
    search: params.q || undefined,
    tagId: params.etiqueta || undefined,
  };

  const display = current.displayCurrency;
  const requestedPage = parsePageParam(params.pagina);
  // Una primera consulta fija el total; si la pagina pedida no existe
  // (p. ej. tras filtrar), se pide de nuevo la ultima valida.
  let { rows: transactions, total } = await getTransactionsPage(
    current.householdId,
    filters,
    (requestedPage - 1) * TRANSACTIONS_PAGE_SIZE,
  );
  let window = pageWindow(total, requestedPage, TRANSACTIONS_PAGE_SIZE);
  if (window.page !== requestedPage) {
    ({ rows: transactions, total } = await getTransactionsPage(
      current.householdId,
      filters,
      window.offset,
    ));
    window = pageWindow(total, window.page, TRANSACTIONS_PAGE_SIZE);
  }
  const { summary, count } = await getFilteredSummary(
    current.householdId,
    filters,
    display,
  );

  const groups = groupByDay(transactions);
  const avgExpense =
    summary.expenseCount > 0 ? -summary.expenseMinor / BigInt(summary.expenseCount) : 0n;

  return (
    <SelectionProvider>
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-8 pb-24 md:px-11">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-medium md:text-[23px]">Movimientos</h1>
          <div className="flex items-center gap-5">
            <SelectionToggle />
            <Button asChild>
              <Link href="/movimientos/nuevo">+ Nuevo movimiento</Link>
            </Button>
          </div>
        </div>

        <form
          method="GET"
          className="border-border flex flex-wrap items-center gap-3 border-t border-b py-3 font-mono text-[12px]"
        >
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="buscar comercio o nota..."
            className="text-muted-foreground placeholder:text-muted-foreground min-w-[160px] flex-1 bg-transparent focus:outline-none"
          />
          <input
            type="date"
            name="desde"
            defaultValue={params.desde}
            className="text-foreground bg-transparent [color-scheme:dark] focus:outline-none"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={params.hasta}
            className="text-foreground bg-transparent [color-scheme:dark] focus:outline-none"
          />
          <select
            name="cuenta"
            defaultValue={params.cuenta}
            className="text-foreground bg-transparent focus:outline-none"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            name="categoria"
            defaultValue={params.categoria}
            className="text-foreground bg-transparent focus:outline-none"
          >
            <option value="">Todas las categorías</option>
            {orderCategories(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {tags.length > 0 ? (
            <select
              name="etiqueta"
              defaultValue={params.etiqueta}
              aria-label="Etiqueta"
              className="text-foreground bg-transparent focus:outline-none"
            >
              <option value="">Todas las etiquetas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="submit" className="border-foreground border-b uppercase">
            filtrar
          </button>

          <div className="ml-auto flex gap-4 uppercase">
            {TYPE_TABS.map((tab) => (
              <TypeTabLink key={tab.value} tab={tab} params={params} />
            ))}
          </div>
        </form>

        <div className="flex flex-col gap-8 md:flex-row">
          <div className="flex-1">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-muted-foreground text-[15px] italic">
                  No hay movimientos con estos filtros
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="text-muted-foreground mt-5 mb-1 font-mono text-[10px] tracking-[0.08em] uppercase first:mt-0">
                    {group.label}
                  </div>
                  {group.items.map((tx) => (
                    <div
                      key={tx.id}
                      className="group border-border flex items-baseline gap-3 border-b py-2.5"
                    >
                      <RowCheckbox id={tx.id} label={tx.merchant || "movimiento"} />
                      <div className="min-w-0 flex-1">
                        {tx.type === "transfer" ? (
                          <span className="text-[14px] italic">{tx.merchant}</span>
                        ) : (
                          <Link
                            href={`/movimientos/${tx.id}/editar`}
                            className="text-[14px] italic underline-offset-2 hover:underline"
                          >
                            {tx.merchant || "(sin nombre)"}
                          </Link>
                        )}
                        <div className="text-muted-foreground font-mono text-[10px] uppercase">
                          {(tx.category_id ? labels.get(tx.category_id) : null) ??
                            tx.category?.name ??
                            (tx.type === "transfer"
                              ? "Transferencia"
                              : "Sin categoría")}{" "}
                          · {tx.account?.name}
                          {tx.recurring_rule_id ? " · recurrente" : ""}
                          {tx.transaction_tags
                            .flatMap((l) => (l.tag ? [l.tag.name] : []))
                            .map((name) => ` · #${name}`)
                            .join("")}
                        </div>
                      </div>
                      <Amount
                        amountMinor={BigInt(tx.amount_minor)}
                        currency={tx.currency}
                        tone={tx.type === "transfer" ? "transfer" : "auto"}
                        signDisplay="always"
                        className="text-[13.5px]"
                      />
                      {tx.type !== "transfer" ? (
                        <Link
                          href={`/movimientos/nuevo?duplicar=${tx.id}`}
                          className="text-muted-foreground font-mono text-[10px] uppercase transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          duplicar
                        </Link>
                      ) : null}
                      <DeleteTransactionButton transactionId={tx.id} />
                    </div>
                  ))}
                </div>
              ))
            )}

            {window.pages > 1 && (
              <nav
                aria-label="Paginación"
                className="border-border text-muted-foreground mt-6 flex items-center justify-between border-t pt-4 font-mono text-[11px] uppercase"
              >
                <span>
                  {window.first}–{window.last} de {window.total}
                </span>
                <span className="flex items-center gap-5">
                  {window.hasPrev ? (
                    <Link
                      href={pageHref(params, window.page - 1)}
                      rel="prev"
                      className="text-foreground border-foreground border-b"
                    >
                      ← anterior
                    </Link>
                  ) : (
                    <span aria-hidden="true">← anterior</span>
                  )}
                  <span>
                    página {window.page} / {window.pages}
                  </span>
                  {window.hasNext ? (
                    <Link
                      href={pageHref(params, window.page + 1)}
                      rel="next"
                      className="text-foreground border-foreground border-b"
                    >
                      siguiente →
                    </Link>
                  ) : (
                    <span aria-hidden="true">siguiente →</span>
                  )}
                </span>
              </nav>
            )}
          </div>

          <div className="w-full shrink-0 md:w-[220px]">
            <div className="text-muted-foreground mb-4 font-mono text-[10px] tracking-[0.12em] uppercase">
              Resumen del período ({display})
            </div>
            <SummaryRow
              label="Ingresos"
              amountMinor={summary.incomeMinor}
              currency={display}
              tone="income"
            />
            <SummaryRow
              label="Gastos"
              amountMinor={summary.expenseMinor}
              currency={display}
              tone="expense"
            />
            <div className="bg-border my-3 h-px" />
            <CountRow label="Movimientos" count={count} />
            <SummaryRow
              label="Promedio por gasto"
              amountMinor={avgExpense}
              currency={display}
            />
            <UnconvertedNotice count={summary.unconverted} />
          </div>
        </div>
      </div>
      <SelectionBar
        categories={orderCategories(categories).map((c) => ({
          id: c.id,
          label: c.label,
          kind: c.kind,
        }))}
      />
    </SelectionProvider>
  );
}

/** Misma URL con otra pagina; conserva todos los filtros activos. */
function pageHref(params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "desde",
    "hasta",
    "cuenta",
    "categoria",
    "etiqueta",
    "tipo",
  ] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("pagina", String(page));
  const text = query.toString();
  return text ? `/movimientos?${text}` : "/movimientos";
}

function TypeTabLink({
  tab,
  params,
}: {
  tab: { value: string; label: string };
  params: SearchParams;
}) {
  const active = (params.tipo || "") === tab.value;
  const query = new URLSearchParams({
    ...(params.q ? { q: params.q } : {}),
    ...(params.desde ? { desde: params.desde } : {}),
    ...(params.hasta ? { hasta: params.hasta } : {}),
    ...(params.cuenta ? { cuenta: params.cuenta } : {}),
    ...(params.categoria ? { categoria: params.categoria } : {}),
    ...(params.etiqueta ? { etiqueta: params.etiqueta } : {}),
    ...(tab.value ? { tipo: tab.value } : {}),
  });
  const href = query.toString() ? `/movimientos?${query.toString()}` : "/movimientos";

  return (
    <Link
      href={href}
      className={
        active ? "border-foreground text-foreground border-b" : "text-muted-foreground"
      }
    >
      {tab.label}
    </Link>
  );
}

function SummaryRow({
  label,
  amountMinor,
  currency,
  tone,
}: {
  label: string;
  amountMinor: bigint;
  currency: Currency;
  tone?: "income" | "expense";
}) {
  return (
    <div className="mb-5">
      <div className="text-muted-foreground font-mono text-[10px] tracking-[0.06em] uppercase">
        {label}
      </div>
      <Amount
        amountMinor={amountMinor}
        currency={currency}
        tone={tone ?? "neutral"}
        className="text-lg"
      />
    </div>
  );
}

function CountRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-5">
      <div className="text-muted-foreground font-mono text-[10px] tracking-[0.06em] uppercase">
        {label}
      </div>
      <span className="font-mono text-lg tabular-nums">{count}</span>
    </div>
  );
}

function groupByDay(
  transactions: Awaited<ReturnType<typeof getTransactionsPage>>["rows"],
) {
  const map = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const list = map.get(tx.occurred_on) ?? [];
    list.push(tx);
    map.set(tx.occurred_on, list);
  }
  return Array.from(map.entries()).map(([date, items]) => ({
    label: formatRelativeDay(date),
    items,
  }));
}
