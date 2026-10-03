import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getReportData } from "@/server/queries/analytics";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { PrintButton } from "@/components/print-button";
import { ProgressLine } from "@/components/budgets/progress-line";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { delta, savingsRatePercent } from "@/lib/analytics";
import {
  formatMonthLabel,
  formatShortDay,
  monthBounds,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
  todayISO,
} from "@/lib/dates";
import { signedPercent } from "@/lib/percent";
import { MonthlyChart, type MonthlyPoint } from "./monthly-chart";

const RANGES = [6, 12] as const;
const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; rango?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const params = await searchParams;
  const todayMonth = monthKeyOf(todayISO());
  const monthKey = parseMonthKey(params.mes) ?? todayMonth;
  const requested = Number(params.rango);
  const months = (RANGES as readonly number[]).includes(requested) ? requested : 6;
  const display = current.displayCurrency;

  const data = await getReportData(current.householdId, monthKey, display, months);
  const { current: cur, previous: prev } = data;
  const { from, to } = monthBounds(monthKey);
  const previousLabel = formatMonthLabel(prev.monthKey);
  const yearAgo = data.yearAgo;
  const yearAgoLabel = formatMonthLabel(yearAgo.monthKey);
  const hasYearAgo = yearAgo.incomeMinor !== 0n || yearAgo.expenseMinor !== 0n;
  const savings = savingsRatePercent(cur);
  const previousSavings = savingsRatePercent(prev);
  const percentText = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;

  // Los gastos se comparan en magnitud: "+8,4%" significa que se gasto mas.
  const comparison = [
    {
      label: "Ingresos",
      d: delta(cur.incomeMinor, prev.incomeMinor),
      tone: "income" as const,
    },
    {
      label: "Gastos",
      d: delta(-cur.expenseMinor, -prev.expenseMinor),
      tone: "expense" as const,
      negate: true,
    },
    {
      label: "Balance",
      d: delta(cur.balanceMinor, prev.balanceMinor),
      tone: "auto" as const,
    },
  ];

  const maxCategory = data.categories[0]?.currentMinor ?? 0n;
  const chartPoints: MonthlyPoint[] = data.monthly.map((m) => ({
    monthKey: m.monthKey,
    income: m.incomeMinor.toString(),
    expense: (-m.expenseMinor).toString(),
  }));
  const query = (month: string) => `/reportes?mes=${month}&rango=${months}`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Reportes</h1>
        <div className="flex flex-wrap items-center gap-5">
          <span className="print:hidden">
            <CurrencySwitcher value={display} />
          </span>
          <span className="print:hidden">
            <PrivacyToggle />
          </span>
          {/* <a> y no <Link>: es una descarga, no una navegacion (y Link la pre-cargaria). */}
          <a
            href={`/api/export/movimientos?desde=${from}&hasta=${to}`}
            className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase print:hidden"
          >
            csv del mes
          </a>
          <a
            href={`/api/export/movimientos?desde=${from}&hasta=${to}&formato=xlsx`}
            className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase print:hidden"
          >
            excel del mes
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="print:hidden">
        <ReportsTabs active="/reportes" />
      </div>

      <div className="border-border flex items-center justify-between border-y py-3 print:[&_a]:hidden">
        <Link
          href={query(shiftMonth(monthKey, -1))}
          aria-label="Mes anterior"
          className="text-muted-foreground font-mono text-[12px]"
        >
          ‹
        </Link>
        <span className="font-mono text-[11.5px] tracking-[0.08em] uppercase">
          {formatMonthLabel(monthKey)}
          {monthKey === todayMonth ? " · este mes" : ""}
        </span>
        <Link
          href={query(shiftMonth(monthKey, 1))}
          aria-label="Mes siguiente"
          className="text-muted-foreground font-mono text-[12px]"
        >
          ›
        </Link>
      </div>

      <UnconvertedNotice count={data.unconverted} />

      <section>
        <h2 className={`${labelClass} mb-2`}>Comparativa con {previousLabel}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] font-mono text-[12px] tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-left text-[9.5px] uppercase">
                <th className="py-1.5 pr-3 font-normal" />
                <th className="py-1.5 pr-3 text-right font-normal capitalize">
                  {formatMonthLabel(monthKey)}
                </th>
                <th className="py-1.5 pr-3 text-right font-normal capitalize">
                  {previousLabel}
                </th>
                <th className="py-1.5 text-right font-normal">Variación</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(({ label, d, tone, negate }) => {
                const sign = (value: bigint) => (negate ? -value : value);
                return (
                  <tr key={label} className="border-border border-t">
                    <td className="py-2 pr-3 font-serif text-[14px] italic">{label}</td>
                    <td className="py-2 pr-3 text-right">
                      <Amount
                        amountMinor={sign(d.currentMinor)}
                        currency={display}
                        withSymbol
                        tone={tone}
                        signDisplay="always"
                      />
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-right">
                      <Amount
                        amountMinor={sign(d.previousMinor)}
                        currency={display}
                        withSymbol
                        tone="neutral"
                        signDisplay="always"
                      />
                    </td>
                    <td className="py-2 text-right">{signedPercent(d.deltaPercent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 font-mono text-[10px]">
          En gastos, un % positivo significa que gastaste más que el mes anterior.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-y-5 md:grid-cols-3">
        <div>
          <div className={`${labelClass} mb-1`}>Tasa de ahorro</div>
          <div
            className={`font-mono text-xl tabular-nums ${
              savings !== null && savings < 0 ? "text-expense" : ""
            }`}
          >
            {percentText(savings)}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-[10px]">
            {savings === null
              ? "sin ingresos este mes"
              : `de lo que entró, ${savings >= 0 ? "ahorraste" : "gastaste de más"} · ${previousLabel}: ${percentText(previousSavings)}`}
          </div>
        </div>
        {hasYearAgo ? (
          <div className="col-span-2 md:col-span-2">
            <div className={`${labelClass} mb-1`}>Contra {yearAgoLabel}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] tabular-nums">
              {[
                {
                  label: "Ingresos",
                  d: delta(cur.incomeMinor, yearAgo.incomeMinor),
                },
                {
                  label: "Gastos",
                  d: delta(-cur.expenseMinor, -yearAgo.expenseMinor),
                },
              ].map(({ label, d }) => (
                <span key={label}>
                  <span className="text-muted-foreground">{label} </span>
                  {signedPercent(d.deltaPercent)}
                </span>
              ))}
            </div>
            <div className="text-muted-foreground mt-1 font-mono text-[10px]">
              En gastos, un % positivo significa que gastaste más que ese mes.
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className={`${labelClass} mb-3`}>Gasto por categoría</h2>
        {data.categories.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-6 text-[15px] italic">
            Sin gastos en {formatMonthLabel(monthKey)}
          </p>
        ) : (
          <div className="flex flex-col">
            {data.categories.map((row) => (
              <div
                key={row.categoryId ?? "sin-categoria"}
                className="border-border flex flex-col gap-1.5 border-t py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="flex-1 text-[14.5px] italic">{row.name}</span>
                  <Amount
                    amountMinor={row.currentMinor}
                    currency={display}
                    tone="neutral"
                    className="text-[13px]"
                  />
                  <span className="text-muted-foreground w-12 text-right font-mono text-[11px]">
                    {row.sharePercent.toFixed(1).replace(".", ",")}%
                  </span>
                </div>
                <ProgressLine
                  percent={
                    maxCategory > 0n ? Number((row.currentMinor * 100n) / maxCategory) : 0
                  }
                  label={`${row.name}: ${row.sharePercent.toFixed(1)}% del gasto del mes`}
                />
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {row.previousMinor === 0n
                    ? "sin gasto el mes anterior"
                    : row.currentMinor === 0n
                      ? "sin gasto este mes"
                      : `${signedPercent(row.deltaPercent)} vs ${previousLabel}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.unusual.length > 0 ? (
        <section>
          <h2 className={`${labelClass} mb-2`}>Gastos fuera de lo habitual</h2>
          <p className="text-muted-foreground mb-2 font-mono text-[10px]">
            Gastos de {formatMonthLabel(monthKey)} que superan por mucho lo que sueles
            gastar en esa categoría (mediana de los meses anteriores).
          </p>
          <div className="flex flex-col">
            {data.unusual.map((item) => (
              <div
                key={item.id}
                className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-2.5"
              >
                <span className="min-w-0 flex-1 text-[14px] italic">
                  {item.merchant ?? item.categoryName}
                  <span className="text-muted-foreground font-mono text-[10px] uppercase not-italic">
                    {" "}
                    · {item.categoryName} · {formatShortDay(item.date)}
                  </span>
                </span>
                <Amount
                  amountMinor={item.amountMinor}
                  currency={display}
                  tone="expense"
                  className="text-[13px]"
                />
                <span className="text-muted-foreground w-24 text-right font-mono text-[10.5px]">
                  {item.ratio.toFixed(1).replace(".", ",")}× lo usual
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={labelClass}>Evolución mensual · ingresos vs. gastos</h2>
          <nav
            className="flex gap-4 font-mono text-[10.5px] uppercase print:hidden"
            aria-label="Rango del gráfico"
          >
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`/reportes?mes=${monthKey}&rango=${range}`}
                aria-current={range === months ? "true" : undefined}
                className={
                  range === months
                    ? "border-foreground text-foreground border-b"
                    : "text-muted-foreground"
                }
              >
                {range} meses
              </Link>
            ))}
          </nav>
        </div>
        <MonthlyChart points={chartPoints} currency={display} />
        <details>
          <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
            ver como tabla
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] font-mono text-[11.5px] tabular-nums">
              <thead>
                <tr className="text-muted-foreground text-left text-[9.5px] uppercase">
                  <th className="py-1.5 pr-3 font-normal">Mes</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Ingresos</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Gastos</th>
                  <th className="py-1.5 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {[...data.monthly].reverse().map((m) => (
                  <tr key={m.monthKey} className="border-border border-t">
                    <td className="py-1.5 pr-3 capitalize">
                      {formatMonthLabel(m.monthKey)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <Amount
                        amountMinor={m.incomeMinor}
                        currency={display}
                        tone="income"
                        signDisplay="always"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <Amount
                        amountMinor={m.expenseMinor}
                        currency={display}
                        tone="expense"
                        signDisplay="always"
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <Amount
                        amountMinor={m.balanceMinor}
                        currency={display}
                        tone="auto"
                        signDisplay="always"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-muted-foreground font-mono text-[10px]">
          Las transferencias entre tus cuentas no cuentan como ingreso ni gasto. Cada
          movimiento se convierte con la cotización de su fecha.
        </p>
      </section>
    </div>
  );
}
