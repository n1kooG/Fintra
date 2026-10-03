import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getDetections } from "@/server/queries/detections";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { CADENCE_LABEL } from "@/lib/detect";
import { formatShortDay } from "@/lib/dates";

const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";

export default async function SuscripcionesPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const display = current.displayCurrency;
  const data = await getDetections(current.householdId, display);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Reportes</h1>
        <div className="flex flex-wrap items-center gap-5">
          <CurrencySwitcher value={display} />
          <PrivacyToggle />
        </div>
      </div>

      <ReportsTabs active="/reportes/suscripciones" />

      <div className="border-border grid grid-cols-1 gap-y-5 border-y py-5 md:grid-cols-2">
        <div>
          <div className={`${labelClass} mb-1`}>Suscripciones sin declarar · al año</div>
          <Amount
            amountMinor={-data.undeclaredAnnualMinor}
            currency={display}
            withSymbol
            tone="expense"
            signDisplay="always"
            className="text-2xl"
          />
        </div>
        <div>
          <div className={`${labelClass} mb-1`}>Gastos hormiga · al año</div>
          <Amount
            amountMinor={-data.smallAnnualMinor}
            currency={display}
            withSymbol
            tone="expense"
            signDisplay="always"
            className="text-2xl"
          />
        </div>
      </div>

      <section>
        <h2 className={`${labelClass} mb-1`}>Cargos que se repiten</h2>
        {data.subscriptions.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-6 text-[15px] italic">
            No detectamos cargos que se repitan con monto parecido
          </p>
        ) : (
          data.subscriptions.map((sub) => (
            <div
              key={sub.key}
              className="border-border flex flex-col gap-1 border-t py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex-1 text-[15px] italic">{sub.label}</span>
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {CADENCE_LABEL[sub.cadence]}
                </span>
                <Amount
                  amountMinor={-sub.typicalMinor}
                  currency={display}
                  tone="expense"
                  signDisplay="always"
                  className="text-[13.5px]"
                />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10.5px]">
                <span>
                  {sub.count} cargos · último {formatShortDay(sub.lastDate)} · próximo
                  esperado {formatShortDay(sub.nextExpected)}
                </span>
                <span>
                  {" "}
                  al año{" "}
                  <Amount
                    amountMinor={-sub.annualizedMinor}
                    currency={display}
                    tone="neutral"
                    signDisplay="always"
                  />
                </span>
                {sub.categoryName ? <span>{sub.categoryName}</span> : null}
                {sub.covered ? (
                  <span>ya está en Recurrentes</span>
                ) : (
                  <Link href="/recurrentes" className="border-muted-foreground border-b">
                    declarar en Recurrentes
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section>
        <h2 className={`${labelClass} mb-1`}>Gastos hormiga</h2>
        <p className="text-muted-foreground mb-2 font-mono text-[10.5px]">
          Compras de hasta{" "}
          <Amount
            amountMinor={data.thresholdMinor}
            currency={display}
            withSymbol
            tone="neutral"
          />{" "}
          que repetiste 4 veces o más en los últimos {data.windowDays} días.
        </p>
        {data.smallSpending.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-6 text-[15px] italic">
            No detectamos gastos hormiga
          </p>
        ) : (
          data.smallSpending.map((item) => (
            <div
              key={item.key}
              className="border-border flex flex-col gap-1 border-t py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex-1 text-[15px] italic">{item.label}</span>
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {item.count} compras
                </span>
                <Amount
                  amountMinor={-item.annualizedMinor}
                  currency={display}
                  tone="expense"
                  signDisplay="always"
                  className="text-[13.5px]"
                />
              </div>
              <div className="text-muted-foreground font-mono text-[10.5px]">
                promedio{" "}
                <Amount
                  amountMinor={item.averageMinor}
                  currency={display}
                  tone="neutral"
                />{" "}
                por compra · al mes{" "}
                <Amount
                  amountMinor={item.monthlyMinor}
                  currency={display}
                  tone="neutral"
                />{" "}
                · la cifra de la derecha es el costo anual a este ritmo
              </div>
            </div>
          ))
        )}
      </section>

      <section className="text-muted-foreground flex flex-col gap-1.5 font-mono text-[10.5px]">
        <h2 className={`${labelClass} mb-1`}>Cómo se detecta</h2>
        <p>
          Una suscripción es un mismo comercio con cargos separados por una cadencia
          regular (semanal, quincenal, mensual o anual) y montos dentro de ±15%. Hace
          falta repetirse 3 veces (2 si es anual). El nombre del comercio se compara sin
          tildes ni mayúsculas, así que escribirlo siempre igual ayuda.
        </p>
        <p>
          Se ignoran los movimientos que ya generó una regla recurrente y las compras en
          cuotas. Un comercio que califica como suscripción no se repite en gastos
          hormiga.
        </p>
      </section>
    </div>
  );
}
