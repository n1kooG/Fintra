import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getCategories } from "@/server/queries/categories";
import { countBudgets, getBudgetMonth } from "@/server/queries/budgets";
import { Amount } from "@/components/money/amount";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import { BudgetsTabs } from "@/components/budgets/budgets-tabs";
import { ProgressLine, type ProgressTone } from "@/components/budgets/progress-line";
import type { BudgetLineView, BudgetStatus } from "@/lib/budgeting";
import {
  formatMonthLabel,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
  todayISO,
} from "@/lib/dates";
import { BudgetFormDialog } from "./budget-form-dialog";
import {
  CopyBudgetsButton,
  DeleteBudgetButton,
  DeleteTotalBudgetButton,
} from "./budget-actions";
import { TotalBudgetDialog } from "./total-budget-dialog";

const TONE: Record<BudgetStatus, ProgressTone> = {
  ok: "neutral",
  warning: "warning",
  over: "danger",
};

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const params = await searchParams;
  const todayMonth = monthKeyOf(todayISO());
  const monthKey = parseMonthKey(params.mes) ?? todayMonth;
  const display = current.displayCurrency;

  const [month, categories] = await Promise.all([
    getBudgetMonth(current.householdId, monthKey, display),
    getCategories(current.householdId),
  ]);

  // Si el mes esta vacio, se ofrece copiar el anterior (solo si el anterior tiene algo).
  const previousKey = shiftMonth(monthKey, -1);
  const previousCount =
    month.lines.length === 0 ? await countBudgets(current.householdId, previousKey) : 0;

  const budgeted = new Set(month.lines.map((l) => l.categoryId));
  const available = categories.filter((c) => c.kind === "expense" && !budgeted.has(c.id));
  const { totals, safe, total } = month;
  const totalCapSource = total
    ? {
        amountMinor: total.capMinor,
        currency: display,
      }
    : undefined;

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Presupuestos</h1>
        <BudgetFormDialog monthKey={monthKey} categories={available} display={display} />
      </div>

      <BudgetsTabs active="/presupuestos" />

      <div className="border-border flex items-center justify-between border-y py-3">
        <Link
          href={`/presupuestos?mes=${shiftMonth(monthKey, -1)}`}
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
          href={`/presupuestos?mes=${shiftMonth(monthKey, 1)}`}
          aria-label="Mes siguiente"
          className="text-muted-foreground font-mono text-[12px]"
        >
          ›
        </Link>
      </div>

      {/* Tope total del mes: un solo limite para todo el gasto */}
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
            Tope total del mes
          </h2>
          <span className="flex items-baseline gap-4">
            <TotalBudgetDialog
              monthKey={monthKey}
              display={display}
              current={totalCapSource}
            />
            {total ? <DeleteTotalBudgetButton totalId={total.id} /> : null}
          </span>
        </div>
        {total ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[13px]">
                <Amount
                  amountMinor={total.spentMinor}
                  currency={display}
                  tone="neutral"
                />
                <span className="text-muted-foreground">
                  {" / "}
                  <Amount
                    amountMinor={total.capMinor}
                    currency={display}
                    tone="neutral"
                  />
                  {" · "}
                  {total.percent}%
                </span>
              </span>
            </div>
            <ProgressLine
              percent={total.percent}
              tone={TONE[total.status]}
              label={`Gasto total: ${total.percent}% del tope del mes`}
            />
            <p className="text-muted-foreground font-mono text-[10.5px]">
              {total.status === "over" ? "Pasaste el tope del mes · " : ""}
              {total.committedMinor > 0n ? (
                <>
                  Faltan{" "}
                  <Amount
                    amountMinor={total.committedMinor}
                    currency={display}
                    tone="neutral"
                  />{" "}
                  en recurrentes · disponible real{" "}
                </>
              ) : (
                <>disponible </>
              )}
              <Amount
                amountMinor={total.remainingMinor}
                currency={display}
                tone="auto"
                signDisplay="always"
              />
            </p>
          </>
        ) : (
          <p className="text-muted-foreground font-mono text-[11px]">
            Opcional: un solo límite para todo lo que gastes este mes, además de los
            presupuestos por categoría.
          </p>
        )}
      </section>

      {month.lines.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 text-center">
          <p className="text-muted-foreground text-[15px] italic">
            No hay presupuestos para {formatMonthLabel(monthKey)}
          </p>
          {previousCount > 0 ? (
            <CopyBudgetsButton
              monthKey={monthKey}
              label={`copiar de ${formatMonthLabel(previousKey)}`}
            />
          ) : (
            <p className="text-muted-foreground max-w-sm font-mono text-[11px]">
              Define cuánto quieres gastar por categoría y verás cuánto te queda por día.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="border-border grid grid-cols-2 gap-y-5 border-b pb-6 md:grid-cols-4">
            <SummaryItem label={`Presupuestado (${display})`}>
              <Amount
                amountMinor={totals.budgetMinor}
                currency={display}
                withSymbol
                tone="neutral"
                className="text-xl"
              />
            </SummaryItem>
            <SummaryItem label="Gastado">
              <Amount
                amountMinor={-totals.spentMinor}
                currency={display}
                withSymbol
                tone="expense"
                signDisplay="always"
                className="text-xl"
              />
            </SummaryItem>
            <SummaryItem
              label={totals.committedMinor > 0n ? "Disponible real" : "Disponible"}
            >
              <Amount
                amountMinor={totals.availableMinor}
                currency={display}
                withSymbol
                tone="auto"
                signDisplay="always"
                className="text-xl"
              />
              {totals.committedMinor > 0n ? (
                <span className="text-muted-foreground mt-1 block font-mono text-[10px]">
                  descuenta{" "}
                  <Amount
                    amountMinor={totals.committedMinor}
                    currency={display}
                    tone="neutral"
                  />{" "}
                  de recurrentes que faltan
                </span>
              ) : null}
            </SummaryItem>
            {safe ? (
              <SummaryItem
                label={`Por día · quedan ${safe.daysLeft} ${safe.daysLeft === 1 ? "día" : "días"}${total ? " · según el tope total" : ""}`}
              >
                <Amount
                  amountMinor={safe.perDayMinor}
                  currency={display}
                  withSymbol
                  tone="neutral"
                  className="text-xl font-semibold"
                />
              </SummaryItem>
            ) : null}
          </div>

          <UnconvertedNotice count={month.unconverted} />

          <div>
            <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
              Presupuestos por categoría
            </div>
            {month.lines.map((line) => (
              <BudgetLine
                key={line.id}
                line={line}
                monthKey={monthKey}
                display={display}
              />
            ))}
          </div>

          {month.unbudgetedSpentMinor > 0n ? (
            <p className="text-muted-foreground font-mono text-[11px]">
              Gasto en categorías sin presupuesto:{" "}
              <Amount
                amountMinor={-month.unbudgetedSpentMinor}
                currency={display}
                withSymbol
                tone="neutral"
                signDisplay="always"
              />{" "}
              (no resta del disponible)
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 font-mono text-[10px] tracking-[0.08em] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function BudgetLine({
  line,
  monthKey,
  display,
}: {
  line: BudgetLineView;
  monthKey: string;
  display: BudgetLineView["currency"];
}) {
  return (
    <div className="border-border group flex flex-col gap-2 border-b py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex-1 text-[14.5px] italic">{line.categoryName}</span>
        <span className="font-mono text-[12px]">
          <Amount amountMinor={line.spentMinor} currency={line.currency} tone="neutral" />
          <span className="text-muted-foreground">
            {" / "}
            <Amount
              amountMinor={line.amountMinor}
              currency={line.currency}
              tone="neutral"
            />
            {" · "}
            {line.percent}%
          </span>
        </span>
      </div>

      <ProgressLine
        percent={line.percent}
        tone={TONE[line.status]}
        label={`${line.categoryName}: ${line.percent}% del presupuesto usado`}
      />

      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] uppercase">
        <StatusText line={line} />
        {line.carryMinor > 0n ? (
          <span>
            · incluye{" "}
            <Amount
              amountMinor={line.carryMinor}
              currency={line.currency}
              tone="neutral"
            />{" "}
            del mes anterior
          </span>
        ) : null}
        {line.committedMinor > 0n ? (
          <span>
            · faltan{" "}
            <Amount
              amountMinor={line.committedMinor}
              currency={line.currency}
              tone="neutral"
            />{" "}
            recurrentes (disponible real{" "}
            <Amount
              amountMinor={line.availableMinor}
              currency={line.currency}
              tone="neutral"
            />
            )
          </span>
        ) : null}
        {line.unconverted > 0 ? <span>· {line.unconverted} sin cotización</span> : null}
        <span className="ml-auto flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <BudgetFormDialog
            monthKey={monthKey}
            categories={[]}
            display={display}
            line={{ ...line, amountMinor: line.baseMinor }}
          />
          <DeleteBudgetButton budgetId={line.id} name={line.categoryName} />
        </span>
      </div>
    </div>
  );
}

/** El estado siempre se dice con palabras: el color solo lo refuerza. */
function StatusText({ line }: { line: BudgetLineView }) {
  if (line.status === "over") {
    return line.remainingMinor < 0n ? (
      <span className="text-expense">
        excedido por{" "}
        <Amount
          amountMinor={-line.remainingMinor}
          currency={line.currency}
          tone="neutral"
        />
      </span>
    ) : (
      <span className="text-expense">tope alcanzado</span>
    );
  }
  return (
    <span className={line.status === "warning" ? "text-expense" : undefined}>
      {line.status === "warning" ? "cerca del tope · " : ""}
      quedan{" "}
      <Amount amountMinor={line.remainingMinor} currency={line.currency} tone="neutral" />
    </span>
  );
}
