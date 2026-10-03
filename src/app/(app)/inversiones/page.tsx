import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getPortfolio, type HoldingView } from "@/server/queries/investments";
import { getNetWorthHistory } from "@/server/queries/networth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cryptoPricesStale, refreshCryptoPrices } from "@/server/prices/crypto";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { ProgressLine } from "@/components/budgets/progress-line";
import { HOLDING_KIND_LABEL } from "@/lib/investments";
import { formatScaled, formatUnits, isUnitMethod } from "@/lib/holding-value";
import { formatShortDay } from "@/lib/dates";
import { NetWorthChart, type ChartPoint } from "./net-worth-chart";
import {
  FlowDialog,
  HoldingDialog,
  PriceDialog,
  RefreshPricesButton,
  ValuationDialog,
} from "./holding-dialogs";
import {
  ArchiveHoldingButton,
  DeleteFlowButton,
  DeleteHoldingButton,
  DeleteValuationButton,
} from "./row-actions";

const RANGES = [6, 12, 24] as const;
const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";

const percentFormat = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** Porcentaje con signo explicito (+ / −): el color nunca va solo. */
function signedPercent(value: number): string {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : "−"}${percentFormat.format(Math.abs(value))}%`;
}

export default async function InversionesPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const params = await searchParams;
  const requested = Number(params.rango);
  const months = (RANGES as readonly number[]).includes(requested) ? requested : 12;
  const display = current.displayCurrency;

  const [portfolio, history] = await Promise.all([
    getPortfolio(current.householdId, display),
    getNetWorthHistory(current.householdId, display, months),
  ]);
  const { totals } = portfolio;
  const now = history[history.length - 1];
  const chartPoints: ChartPoint[] = history.map((p) => ({
    date: p.date,
    net: p.netWorthMinor.toString(),
    assets: p.assetsMinor.toString(),
    liabilities: p.liabilitiesMinor.toString(),
  }));
  const today = history[history.length - 1].date;
  const hasAny = portfolio.active.length + portfolio.archived.length > 0;
  const hasCrypto = portfolio.active.some((h) => h.method === "crypto");

  // Los precios de las criptomonedas se refrescan despues de responder: es una
  // llamada externa y no debe demorar la pantalla. El cron diario hace lo mismo.
  if (cryptoPricesStale(portfolio.active, today)) {
    const admin = createAdminClient();
    if (admin) {
      after(async () => {
        try {
          await refreshCryptoPrices(admin, current.householdId);
        } catch {
          // Sin conexion a CoinGecko: se reintenta en la proxima visita.
        }
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Inversiones y patrimonio</h1>
        <div className="flex flex-wrap items-center gap-5">
          <CurrencySwitcher value={display} />
          <PrivacyToggle />
          <HoldingDialog />
        </div>
      </div>

      <div className="border-border grid grid-cols-2 gap-y-5 border-y py-5 md:grid-cols-4">
        <Stat label={`Patrimonio neto (${display})`}>
          <Amount
            amountMinor={now.netWorthMinor}
            currency={display}
            withSymbol
            tone={now.netWorthMinor < 0n ? "expense" : "neutral"}
            className="text-2xl font-semibold"
          />
        </Stat>
        <Stat label="Valor de cartera">
          <Amount
            amountMinor={totals.valueMinor}
            currency={display}
            withSymbol
            tone="neutral"
            className="text-xl"
          />
        </Stat>
        <Stat label="Aportado">
          <Amount
            amountMinor={totals.investedMinor}
            currency={display}
            withSymbol
            tone="neutral"
            className="text-xl"
          />
        </Stat>
        <Stat label="Ganancia">
          <Amount
            amountMinor={totals.gainMinor}
            currency={display}
            withSymbol
            tone="auto"
            signDisplay="always"
            className="text-xl"
          />
          {totals.returnPercent !== null ? (
            <span className="text-muted-foreground ml-2 font-mono text-[11px]">
              {signedPercent(totals.returnPercent)}
            </span>
          ) : null}
        </Stat>
      </div>
      <UnconvertedNotice count={totals.unconverted + now.unconverted} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={labelClass}>Evolución del patrimonio neto</h2>
          <nav
            className="flex gap-4 font-mono text-[10.5px] uppercase"
            aria-label="Rango de la curva"
          >
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`/inversiones?rango=${range}`}
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

        {history.length < 2 ? (
          <p className="border-border text-muted-foreground border-t py-8 text-[15px] italic">
            La curva se arma con tu historial: aparece cuando haya movimientos de más de
            un mes.
          </p>
        ) : (
          <>
            <NetWorthChart points={chartPoints} currency={display} />
            <details>
              <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
                ver como tabla
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] font-mono text-[11.5px] tabular-nums">
                  <thead>
                    <tr className="text-muted-foreground text-left text-[9.5px] uppercase">
                      <th className="py-1.5 pr-3 font-normal">Fecha</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Activos</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Pasivos</th>
                      <th className="py-1.5 text-right font-normal">Patrimonio neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((point) => (
                      <tr key={point.date} className="border-border border-t">
                        <td className="py-1.5 pr-3">
                          {point.date === today
                            ? "hoy"
                            : `${formatShortDay(point.date)} ${point.date.slice(0, 4)}`}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <Amount
                            amountMinor={point.assetsMinor}
                            currency={display}
                            tone="neutral"
                          />
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <Amount
                            amountMinor={point.liabilitiesMinor}
                            currency={display}
                            tone="neutral"
                          />
                        </td>
                        <td className="py-1.5 text-right">
                          <Amount
                            amountMinor={point.netWorthMinor}
                            currency={display}
                            tone="neutral"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        <p className="text-muted-foreground font-mono text-[10px]">
          Se reconstruye desde tus movimientos, valorizaciones y préstamos, con la
          cotización de cada fecha. No incluye deudas entre personas.
        </p>
      </section>

      {portfolio.allocation.length > 0 ? (
        <section>
          <h2 className={`${labelClass} mb-3`}>Reparto de la cartera</h2>
          <div className="flex flex-col gap-3">
            {portfolio.allocation.map((row) => (
              <div key={row.kind}>
                <div className="mb-1 flex items-baseline justify-between text-[13px]">
                  <span>{HOLDING_KIND_LABEL[row.kind]}</span>
                  <span className="font-mono text-[11.5px]">
                    <Amount
                      amountMinor={row.valueMinor}
                      currency={display}
                      tone="neutral"
                      className="text-muted-foreground"
                    />
                    <span className="text-muted-foreground">
                      {" "}
                      · {percentFormat.format(row.percent)}%
                    </span>
                  </span>
                </div>
                <ProgressLine
                  percent={row.percent}
                  label={`${HOLDING_KIND_LABEL[row.kind]}: ${percentFormat.format(row.percent)}% de la cartera`}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className={labelClass}>Instrumentos</h2>
          {hasCrypto ? <RefreshPricesButton /> : null}
        </div>
        {portfolio.active.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-8 text-[15px] italic">
            {hasAny
              ? "No tienes instrumentos activos"
              : "Todavía no registraste instrumentos de inversión"}
          </p>
        ) : (
          portfolio.active.map((holding) => (
            <HoldingRow key={holding.id} holding={holding} />
          ))
        )}

        {portfolio.archived.length > 0 ? (
          <details className="mt-4">
            <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
              {portfolio.archived.length}{" "}
              {portfolio.archived.length === 1
                ? "instrumento archivado"
                : "instrumentos archivados"}
            </summary>
            {portfolio.archived.map((holding) => (
              <HoldingRow key={holding.id} holding={holding} />
            ))}
          </details>
        ) : null}
      </section>

      <p className="text-muted-foreground font-mono text-[10.5px]">
        Los depósitos a plazo, las divisas y las criptomonedas se valorizan solos; en los
        demás actualizas tú el valor o el precio. Los aportes y retiros son un registro
        del instrumento y no mueven el saldo de tus cuentas.
      </p>
    </div>
  );
}

/** Precio por unidad escalado (6 decimales) con formato chileno y sin ceros de relleno. */
function formatPrice(price: bigint): string {
  const [int, frac] = formatScaled(price, 6).split(".");
  const trimmed = frac.replace(/0+$/, "");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${trimmed ? `,${trimmed}` : ""}`;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 font-mono text-[10px] tracking-[0.08em] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function HoldingRow({ holding }: { holding: HoldingView }) {
  const { metrics } = holding;

  return (
    <div className="border-border group flex flex-col gap-2 border-t py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex-1 text-[15px] italic">
          {holding.name}
          <span className="text-muted-foreground font-mono text-[10px] uppercase not-italic">
            {" "}
            · {HOLDING_KIND_LABEL[holding.kind]}
            {holding.institution ? ` · ${holding.institution}` : ""} · {holding.currency}
          </span>
        </span>
        <Amount
          amountMinor={metrics.valueMinor}
          currency={holding.currency}
          withSymbol
          tone="neutral"
          className="text-lg"
        />
      </div>

      {holding.method === "fixed_term" && holding.maturity && holding.terms ? (
        <p className="text-muted-foreground font-mono text-[11px]">
          {holding.maturity.days > 0
            ? `vence en ${holding.maturity.days} ${holding.maturity.days === 1 ? "día" : "días"}`
            : holding.maturity.days === 0
              ? "vence hoy"
              : "vencido"}{" "}
          ({formatShortDay(holding.maturity.end)} {holding.maturity.end.slice(0, 4)}) ·
          tasa {percentFormat.format(Number(holding.terms.ratePercentScaled) / 10_000)}%{" "}
          {holding.terms.period === "monthly" ? "mensual" : "anual"} · interés devengado{" "}
          <Amount
            amountMinor={holding.maturity.accruedMinor}
            currency={holding.currency}
            tone="neutral"
          />{" "}
          · al vencer{" "}
          <Amount
            amountMinor={holding.maturity.totalAtMaturityMinor}
            currency={holding.currency}
            tone="neutral"
          />
        </p>
      ) : null}

      {isUnitMethod(holding.method) && metrics.unitsHeld !== null ? (
        <p className="text-muted-foreground font-mono text-[11px]">
          {formatUnits(metrics.unitsHeld)} {holding.assetCode ?? "unidades"}
          {metrics.unitPrice !== null ? (
            <>
              {" "}
              × {formatPrice(metrics.unitPrice)} {holding.currency}
              {metrics.valuedOn ? ` (al ${formatShortDay(metrics.valuedOn)})` : ""}
            </>
          ) : (
            " · sin precio todavía"
          )}
        </p>
      ) : null}

      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10.5px]">
        <span>
          aportado{" "}
          <Amount
            amountMinor={metrics.investedMinor}
            currency={holding.currency}
            tone="neutral"
          />
        </span>
        <span>
          ganancia{" "}
          <Amount
            amountMinor={metrics.gainMinor}
            currency={holding.currency}
            tone="auto"
            signDisplay="always"
          />
          {metrics.returnPercent !== null
            ? ` (${signedPercent(metrics.returnPercent)})`
            : ""}
        </span>
        {holding.monthReturnPercent !== null ? (
          <span>{signedPercent(holding.monthReturnPercent)} en 30 días</span>
        ) : null}
        {metrics.annualizedPercent !== null ? (
          <span>{signedPercent(metrics.annualizedPercent)} anual</span>
        ) : null}
        {holding.realAnnualPercent !== null ? (
          <span title="Rentabilidad anual descontada la inflación (variación de la UF)">
            {signedPercent(holding.realAnnualPercent)} real anual
          </span>
        ) : null}
        {holding.method === "manual" ? (
          <span>
            {metrics.valued && metrics.valuedOn
              ? `valorizado el ${formatShortDay(metrics.valuedOn)}`
              : "a costo: sin valorizar todavía"}
          </span>
        ) : (
          <span>{metrics.valued ? "valoriza solo" : "a costo: sin precio todavía"}</span>
        )}
      </div>

      {holding.notes ? (
        <p className="text-muted-foreground text-[13px] italic">{holding.notes}</p>
      ) : null}

      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {!holding.archived ? (
          <>
            {holding.method === "manual" ? (
              <ValuationDialog
                holdingId={holding.id}
                name={holding.name}
                currency={holding.currency}
              />
            ) : null}
            {holding.method === "priced" ? (
              <PriceDialog
                holdingId={holding.id}
                name={holding.name}
                currency={holding.currency}
              />
            ) : null}
            <FlowDialog
              holdingId={holding.id}
              name={holding.name}
              currency={holding.currency}
              method={holding.method}
              assetCode={holding.assetCode}
            />
          </>
        ) : null}
        <span className="ml-auto flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <HoldingDialog
            holding={{
              id: holding.id,
              name: holding.name,
              institution: holding.institution,
              notes: holding.notes,
              method: holding.method,
              terms: holding.terms
                ? {
                    end: holding.terms.end,
                    ratePercent: formatScaled(holding.terms.ratePercentScaled, 4).replace(
                      /\.?0+$/,
                      "",
                    ),
                    period: holding.terms.period,
                  }
                : null,
            }}
          />
          <ArchiveHoldingButton holdingId={holding.id} archived={holding.archived} />
          <DeleteHoldingButton holdingId={holding.id} name={holding.name} />
        </span>
      </div>

      <details>
        <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
          historial ({holding.flows.length}{" "}
          {holding.flows.length === 1 ? "movimiento" : "movimientos"},{" "}
          {holding.valuations.length}{" "}
          {holding.valuations.length === 1 ? "valorización" : "valorizaciones"})
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground mb-1 font-mono text-[9.5px] uppercase">
              Aportes y retiros
            </div>
            {holding.flows.map((flow) => (
              <div
                key={flow.id}
                className="border-border flex items-baseline gap-3 border-t py-1.5 text-[13px]"
              >
                <span className="text-muted-foreground w-14 shrink-0 font-mono text-[10px]">
                  {formatShortDay(flow.occurredOn)}
                </span>
                <span className="flex-1 truncate italic">
                  {flow.units !== null
                    ? `${flow.amountMinor > 0n ? "compra" : "venta"} ${formatUnits(
                        flow.units < 0n ? -flow.units : flow.units,
                      )}`
                    : flow.amountMinor > 0n
                      ? "aporte"
                      : "retiro"}
                  {flow.notes ? ` · ${flow.notes}` : ""}
                </span>
                <Amount
                  amountMinor={flow.amountMinor}
                  currency={holding.currency}
                  tone="auto"
                  signDisplay="always"
                  className="text-[12.5px]"
                />
                <DeleteFlowButton flowId={flow.id} />
              </div>
            ))}
          </div>
          <div>
            <div className="text-muted-foreground mb-1 font-mono text-[9.5px] uppercase">
              Valorizaciones
            </div>
            {holding.valuations.length === 0 ? (
              <p className="text-muted-foreground font-mono text-[11px]">
                Sin valorizaciones
              </p>
            ) : (
              holding.valuations.map((valuation) => (
                <div
                  key={valuation.id}
                  className="border-border flex items-baseline gap-3 border-t py-1.5 text-[13px]"
                >
                  <span className="text-muted-foreground w-14 shrink-0 font-mono text-[10px]">
                    {formatShortDay(valuation.valuedOn)}
                  </span>
                  <span className="text-muted-foreground flex-1 truncate font-mono text-[10px]">
                    {valuation.unitPrice !== null
                      ? `${formatPrice(valuation.unitPrice)} por unidad${valuation.source === "coingecko" ? " · CoinGecko" : ""}`
                      : ""}
                  </span>
                  <Amount
                    amountMinor={valuation.valueMinor}
                    currency={holding.currency}
                    tone="neutral"
                    className="text-[12.5px]"
                  />
                  <DeleteValuationButton valuationId={valuation.id} />
                </div>
              ))
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
