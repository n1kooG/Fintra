import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getCashFlowProjection } from "@/server/queries/cashflow";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { SCENARIO_PERCENTS, parseScenario, type VariableEstimate } from "@/lib/cashflow";
import { formatMonthLabel, formatShortDay, monthKeyOf, todayISO } from "@/lib/dates";
import { ProjectionChart } from "./projection-chart";

const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";

function basisText(estimate: VariableEstimate): string {
  switch (estimate.basis) {
    case "full_months":
      return `promedio de ${estimate.months === 1 ? "el último mes completo" : `los últimos ${estimate.months} meses completos`}`;
    case "current_month":
      return "el ritmo de este mes (todavía no hay un mes completo)";
    case "none":
      return "sin datos de gasto: se proyecta solo lo programado";
  }
}

export default async function ProyeccionPage({
  searchParams,
}: {
  searchParams: Promise<{ escenario?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");
  const scenario = parseScenario((await searchParams).escenario);

  const display = current.displayCurrency;
  const { projection, estimate, liquidAccounts, unconverted } =
    await getCashFlowProjection(current.householdId, display, scenario);
  const currentMonth = monthKeyOf(todayISO());
  const shortfall = projection.firstShortfall;

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Reportes</h1>
        <div className="flex flex-wrap items-center gap-5">
          <CurrencySwitcher value={display} />
          <PrivacyToggle />
        </div>
      </div>

      <ReportsTabs active="/reportes/proyeccion" />

      <div role="status" className="border-border border-y py-4">
        {shortfall ? (
          <p className="text-[16px]">
            <span className="text-expense font-mono text-[11px] tracking-[0.1em] uppercase">
              Alerta ·{" "}
            </span>
            Si todo sigue como está programado, el{" "}
            <span className="italic">{formatShortDay(shortfall.date)}</span> te quedarías
            sin saldo líquido (
            <Amount
              amountMinor={shortfall.balanceMinor}
              currency={display}
              withSymbol
              tone="expense"
              signDisplay="always"
            />
            ).
          </p>
        ) : (
          <p className="text-[16px]">
            <span className="text-muted-foreground font-mono text-[11px] tracking-[0.1em] uppercase">
              Sin alertas ·{" "}
            </span>
            Con lo programado y tu gasto habitual, el saldo líquido no baja de cero en los
            próximos 6 meses.
          </p>
        )}
      </div>

      <UnconvertedNotice count={unconverted} />

      <div className="grid grid-cols-2 gap-y-5 md:grid-cols-3">
        <div>
          <div className={`${labelClass} mb-1`}>Saldo líquido hoy</div>
          <Amount
            amountMinor={projection.startingBalanceMinor}
            currency={display}
            withSymbol
            tone={projection.startingBalanceMinor < 0n ? "expense" : "neutral"}
            className="text-xl"
          />
          <div className="text-muted-foreground mt-1 font-mono text-[10px]">
            {liquidAccounts} {liquidAccounts === 1 ? "cuenta" : "cuentas"} (efectivo,
            corriente, vista y ahorro)
          </div>
        </div>
        <div>
          <div className={`${labelClass} mb-1`}>Gasto variable estimado / mes</div>
          <Amount
            amountMinor={estimate.monthlyMinor}
            currency={display}
            withSymbol
            tone="neutral"
            className="text-xl"
          />
          <div className="text-muted-foreground mt-1 font-mono text-[10px]">
            {basisText(estimate)}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={labelClass}>¿Y si gasto distinto?</h2>
          <nav
            className="flex gap-4 font-mono text-[10.5px] uppercase"
            aria-label="Escenario del gasto variable"
          >
            {SCENARIO_PERCENTS.map((percent) => (
              <Link
                key={percent}
                href={
                  percent === 0
                    ? "/reportes/proyeccion"
                    : `/reportes/proyeccion?escenario=${percent}`
                }
                aria-current={percent === scenario ? "true" : undefined}
                className={
                  percent === scenario
                    ? "border-foreground text-foreground border-b"
                    : "text-muted-foreground"
                }
              >
                {percent === 0
                  ? "tal cual"
                  : `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-muted-foreground font-mono text-[10px]">
          {scenario === 0
            ? "Prueba cuánto cambia el saldo si en lo variable gastas menos o más que tu promedio."
            : `Simulando que gastas un ${Math.abs(scenario)}% ${scenario > 0 ? "más" : "menos"} de lo variable (lo programado no cambia).`}
        </p>
        <ProjectionChart
          currency={display}
          points={projection.months.map((m) => ({
            monthKey: m.monthKey,
            endBalance: m.endBalanceMinor.toString(),
            lowestBalance: m.lowestBalanceMinor.toString(),
          }))}
        />
      </section>

      <section>
        <h2 className={`${labelClass} mb-2`}>Mes a mes</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] font-mono text-[11.5px] tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-left text-[9.5px] uppercase">
                <th className="py-1.5 pr-3 font-normal">Mes</th>
                <th className="py-1.5 pr-3 text-right font-normal">Ingresos</th>
                <th className="py-1.5 pr-3 text-right font-normal">Programado</th>
                <th className="py-1.5 pr-3 text-right font-normal">Variable est.</th>
                <th className="py-1.5 pr-3 text-right font-normal">Saldo al cierre</th>
                <th className="py-1.5 text-right font-normal">Punto más bajo</th>
              </tr>
            </thead>
            <tbody>
              {projection.months.map((month) => (
                <tr
                  key={month.monthKey}
                  className="border-border border-t align-baseline"
                >
                  <td className="py-2 pr-3 font-serif text-[14px] italic">
                    <span className="capitalize">{formatMonthLabel(month.monthKey)}</span>
                    {month.monthKey === currentMonth ? (
                      <span className="text-muted-foreground font-mono text-[9.5px] uppercase not-italic">
                        {" "}
                        · lo que falta
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount
                      amountMinor={month.incomeMinor}
                      currency={display}
                      tone="income"
                      signDisplay="always"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount
                      amountMinor={-month.committedMinor}
                      currency={display}
                      tone="expense"
                      signDisplay="always"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount
                      amountMinor={-month.variableMinor}
                      currency={display}
                      tone="expense"
                      signDisplay="always"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount
                      amountMinor={month.endBalanceMinor}
                      currency={display}
                      tone={month.endBalanceMinor < 0n ? "expense" : "neutral"}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Amount
                      amountMinor={month.lowestBalanceMinor}
                      currency={display}
                      tone={month.short ? "expense" : "neutral"}
                    />
                    {month.short ? (
                      <div className="text-expense text-[9.5px] uppercase">
                        sin saldo el {formatShortDay(month.lowestOn)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-muted-foreground flex flex-col gap-1.5 font-mono text-[10.5px]">
        <h2 className={`${labelClass} mb-1`}>Cómo se calcula</h2>
        <p>
          Parte del saldo líquido de hoy y avanza día a día, sumando ingresos y restando
          egresos recurrentes, cuotas de préstamos y la facturación de tus tarjetas
          (cuotas ya agendadas más las compras que ya están en un estado de cuenta).
        </p>
        <p>
          Lo que gastas sin tenerlo programado (supermercado, salidas...) se estima con tu
          promedio reciente y se reparte por día. Todo se convierte con la cotización de
          hoy.
        </p>
        <p>
          Es una estimación: no conoce ingresos que no estén en Recurrentes ni gastos
          extraordinarios, y asume que cada vencimiento se paga en su fecha. Un pago
          adelantado a una tarjeta no se descuenta dos veces (la facturación no supera lo
          que hoy se debe).
        </p>
      </section>
    </div>
  );
}
