import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccountsOverview } from "@/server/queries/accounts";
import { getMonthReport, getRecentTransactions } from "@/server/queries/transactions";
import { getCalendarEvents } from "@/server/queries/calendar";
import { getBudgetMonth } from "@/server/queries/budgets";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { Button } from "@/components/ui/button";
import {
  SANTIAGO_TZ,
  formatRelativeDay,
  formatShortDay,
  monthKeyOf,
  todayISO,
} from "@/lib/dates";
import { addDays } from "@/lib/recurrence";

export default async function DashboardPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const now = new Date();
  const year = Number(
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: SANTIAGO_TZ }).format(
      now,
    ),
  );
  const month = Number(
    new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: SANTIAGO_TZ }).format(
      now,
    ),
  );
  const monthLabel = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: SANTIAGO_TZ,
  }).format(now);

  const display = current.displayCurrency;
  const today = todayISO();
  const [{ accounts, netWorth }, report, recent, upcoming, budget] = await Promise.all([
    getAccountsOverview(current.householdId, display),
    getMonthReport(current.householdId, year, month, display),
    getRecentTransactions(current.householdId, 5),
    getCalendarEvents(current.householdId, today, addDays(today, 14)),
    getBudgetMonth(current.householdId, monthKeyOf(todayISO()), display),
  ]);
  const { summary, breakdown } = report;
  const alerts = budget.lines
    .filter((line) => line.status !== "ok")
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);

  const firstName = current.displayName.split(" ")[0];
  const hasAnyData = accounts.length > 0;

  // Primera visita sin ninguna cuenta: el asistente en vez de un dashboard vacio.
  if (!hasAnyData && !current.onboarded) redirect("/bienvenida");

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium md:text-[23px]">Hola, {firstName}</h1>
          <p className="text-muted-foreground mt-1 font-mono text-[11px] capitalize">
            {monthLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <CurrencySwitcher value={display} />
          <PrivacyToggle />
          <Button asChild>
            <Link href="/movimientos/nuevo">+ Nuevo movimiento</Link>
          </Button>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="border-border flex flex-1 flex-col items-center justify-center gap-3 border-t py-16 text-center">
          <p className="text-muted-foreground text-[15px] italic">
            Todavía no agregaste ninguna cuenta
          </p>
          <Button asChild>
            <Link href="/cuentas">+ Agregar cuenta</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="border-border flex flex-wrap items-start justify-between gap-x-12 gap-y-6 border-t pt-6 pb-1">
            {budget.safe ? (
              <div>
                <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  Disponible por día · quedan {budget.safe.daysLeft}{" "}
                  {budget.safe.daysLeft === 1 ? "día" : "días"}
                </div>
                <Amount
                  amountMinor={budget.safe.perDayMinor}
                  currency={display}
                  withSymbol
                  tone="neutral"
                  className="mt-2 block text-[44px] leading-none font-semibold"
                />
                <p className="text-muted-foreground mt-3 font-mono text-[11px]">
                  {budget.safe.remainingMinor > 0n ? (
                    <>
                      quedan{" "}
                      <Amount
                        amountMinor={budget.safe.remainingMinor}
                        currency={display}
                        withSymbol
                        tone="neutral"
                      />{" "}
                      de{" "}
                      <Amount
                        amountMinor={
                          budget.total ? budget.total.capMinor : budget.totals.budgetMinor
                        }
                        currency={display}
                        withSymbol
                        tone="neutral"
                      />{" "}
                      {budget.total ? "de tope" : "presupuestados"}
                      {(budget.total
                        ? budget.total.committedMinor
                        : budget.totals.committedMinor) > 0n
                        ? ", descontando lo recurrente que falta"
                        : ""}
                    </>
                  ) : budget.safe.remainingMinor < 0n ? (
                    <>
                      te pasaste{" "}
                      <Amount
                        amountMinor={-budget.safe.remainingMinor}
                        currency={display}
                        withSymbol
                        tone="expense"
                      />{" "}
                      del presupuesto del mes
                    </>
                  ) : (
                    "ya usaste todo el presupuesto del mes"
                  )}
                </p>
              </div>
            ) : (
              <div>
                <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  Disponible por día
                </div>
                <p className="text-muted-foreground mt-2 max-w-xs text-[15px] italic">
                  Define tu presupuesto del mes y verás cuánto puedes gastar cada día
                </p>
                <Link
                  href="/presupuestos"
                  className="border-foreground mt-3 inline-block border-b pb-0.5 font-mono text-[10.5px] uppercase"
                >
                  definir presupuesto
                </Link>
              </div>
            )}

            {alerts.length > 0 ? (
              <div className="min-w-[220px]">
                <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
                  Alertas de presupuesto
                </div>
                {alerts.map((line) => (
                  <Link
                    key={line.id}
                    href="/presupuestos"
                    className="border-border flex items-baseline gap-3 border-b py-1.5 text-[13.5px]"
                  >
                    <span className="flex-1 truncate italic">{line.categoryName}</span>
                    <span className="text-expense font-mono text-[10.5px] uppercase">
                      {line.percent}% ·{" "}
                      {line.status === "warning"
                        ? "cerca del tope"
                        : line.remainingMinor < 0n
                          ? "excedido"
                          : "tope alcanzado"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {/* El -ml-5 y el overflow-hidden esconden la linea izquierda de cada primera celda de la fila:
              las demas quedan con 20px de aire a cada lado de la linea divisoria. */}
          <div className="border-border overflow-hidden border-t border-b">
            <div className="-ml-5 flex flex-wrap">
              <div className="border-border min-w-[170px] flex-1 border-l px-5 py-4">
                <div className="text-muted-foreground font-mono text-[9.5px] tracking-[0.08em] uppercase">
                  Patrimonio neto ({display})
                </div>
                <Amount
                  amountMinor={netWorth.netWorthMinor}
                  currency={display}
                  withSymbol
                  tone={netWorth.netWorthMinor < 0n ? "expense" : "neutral"}
                  className="mt-1.5 text-lg font-semibold"
                />
              </div>
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="border-border min-w-[170px] flex-1 border-l px-5 py-4"
                >
                  <div className="text-muted-foreground truncate font-mono text-[9.5px] tracking-[0.08em] uppercase">
                    {a.name}
                  </div>
                  <Amount
                    amountMinor={a.balanceMinor}
                    currency={a.currency}
                    tone={a.balanceMinor < 0n ? "expense" : "neutral"}
                    className="mt-1.5 text-lg"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
                Resumen del mes ({display})
              </div>
              <div className="mb-6 flex gap-10">
                <div>
                  <div className="text-muted-foreground font-mono text-[10px] uppercase">
                    Ingresos
                  </div>
                  <Amount
                    amountMinor={summary.incomeMinor}
                    currency={display}
                    tone="income"
                    signDisplay="always"
                    className="text-xl"
                  />
                </div>
                <div>
                  <div className="text-muted-foreground font-mono text-[10px] uppercase">
                    Gastos
                  </div>
                  <Amount
                    amountMinor={summary.expenseMinor}
                    currency={display}
                    tone="expense"
                    signDisplay="always"
                    className="text-xl"
                  />
                </div>
                <div>
                  <div className="text-muted-foreground font-mono text-[10px] uppercase">
                    Balance
                  </div>
                  <Amount
                    amountMinor={summary.balanceMinor}
                    currency={display}
                    tone="auto"
                    signDisplay="always"
                    className="text-xl"
                  />
                </div>
              </div>

              <UnconvertedNotice count={report.unconverted + netWorth.unconverted} />

              <div className="mt-6 mb-3 flex items-baseline justify-between">
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  Últimos movimientos
                </span>
                <Link
                  href="/movimientos"
                  className="text-muted-foreground font-mono text-[10.5px] uppercase"
                >
                  ver todos
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="border-border text-muted-foreground border-t py-6 text-[14px] italic">
                  Todavía no hay movimientos este mes
                </p>
              ) : (
                recent.map((tx) => (
                  <div
                    key={tx.id}
                    className="border-border flex items-baseline gap-3 border-b py-2.5"
                  >
                    <span className="text-muted-foreground w-12 shrink-0 font-mono text-[10px]">
                      {formatRelativeDay(tx.occurred_on)}
                    </span>
                    <span className="flex-1 truncate text-[14px] italic">
                      {tx.merchant || tx.category?.name || "Transferencia"}
                    </span>
                    <Amount
                      amountMinor={BigInt(tx.amount_minor)}
                      currency={tx.currency}
                      tone={tx.type === "transfer" ? "transfer" : "auto"}
                      signDisplay="always"
                      className="text-[13px]"
                    />
                  </div>
                ))
              )}
            </div>

            <div>
              <div className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
                Gasto por categoría
              </div>
              {breakdown.length === 0 ? (
                <p className="text-muted-foreground font-mono text-[11px]">
                  Sin gastos este mes
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {breakdown.slice(0, 6).map((row) => {
                    const max = breakdown[0]?.totalMinor ?? 1n;
                    const pct = max > 0n ? Number((row.totalMinor * 100n) / max) : 0;
                    return (
                      <div key={row.categoryId ?? "sin-categoria"}>
                        <div className="mb-1 flex justify-between text-[13px]">
                          <span>{row.name}</span>
                          <Amount
                            amountMinor={row.totalMinor}
                            currency={display}
                            tone="neutral"
                            className="text-muted-foreground text-[11.5px]"
                          />
                        </div>
                        <div className="bg-border h-px">
                          <div
                            className="bg-foreground h-px"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 mb-3 flex items-baseline justify-between">
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  Próximos 14 días
                </span>
                <Link
                  href="/calendario"
                  className="text-muted-foreground font-mono text-[10.5px] uppercase"
                >
                  calendario
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-muted-foreground font-mono text-[11px]">
                  Sin vencimientos ni ingresos programados
                </p>
              ) : (
                upcoming.slice(0, 6).map((event) => (
                  <div
                    key={event.id}
                    className="border-border flex items-baseline gap-3 border-b py-2"
                  >
                    <span className="text-muted-foreground w-12 shrink-0 font-mono text-[10px]">
                      {formatShortDay(event.date)}
                    </span>
                    <span className="flex-1 truncate text-[13.5px] italic">
                      {event.label}
                      {event.estimated ? " (estimado)" : ""}
                    </span>
                    {event.amountMinor !== null ? (
                      <Amount
                        amountMinor={event.amountMinor}
                        currency={event.currency}
                        signDisplay="always"
                        className="text-[12.5px]"
                      />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
