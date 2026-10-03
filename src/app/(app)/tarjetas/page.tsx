import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import {
  getCardsOverview,
  type CardPlanView,
  type CardView,
} from "@/server/queries/cards";
import { getLoans, type LoanView } from "@/server/queries/loans";
import { getAccounts } from "@/server/queries/accounts";
import { getPersonalDebts, type PersonalDebtView } from "@/server/queries/debts";
import { Amount } from "@/components/money/amount";
import { ProgressLine, type ProgressTone } from "@/components/budgets/progress-line";
import { budgetStatus } from "@/lib/budgeting";
import type { PaymentStatus, Statement } from "@/lib/cards";
import { formatShortDay, todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { CardSettingsDialog } from "./card-settings-dialog";
import { LoanDialog, PersonalDebtDialog } from "./debt-dialogs";
import { PrepaymentDialog } from "./loan-prepayment-dialog";
import { PayCardDialog } from "./pay-card-dialog";
import { fromMinorUnits } from "@/lib/money";
import {
  DeleteDebtButton,
  DeleteLoanButton,
  DeletePlanPurchaseButton,
  DeletePrepaymentButton,
  SettleDebtButton,
} from "./row-actions";

const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";

const percentFormat = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function TarjetasPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const [cards, loans, debts, accounts] = await Promise.all([
    getCardsOverview(current.householdId),
    getLoans(current.householdId),
    getPersonalDebts(current.householdId),
    getAccounts(current.householdId),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-9 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Tarjetas, cuotas y deudas</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/calendario"
            className="text-muted-foreground font-mono text-[10.5px] uppercase"
          >
            ver calendario
          </Link>
          <PersonalDebtDialog />
          <LoanDialog />
        </div>
      </div>

      <section className="flex flex-col gap-8">
        <h2 className={labelClass}>Tarjetas de crédito</h2>
        {cards.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-8 text-[15px] italic">
            Todavía no tienes tarjetas de crédito.{" "}
            <Link
              href="/cuentas"
              className="border-foreground text-foreground border-b not-italic"
            >
              Crear una cuenta de tipo Tarjeta de crédito
            </Link>
          </p>
        ) : (
          cards.map((card) => (
            <CardBlock
              key={card.account.id}
              card={card}
              payAccounts={accounts
                .filter((a) => a.type !== "credit_card")
                .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
            />
          ))
        )}
      </section>

      <section>
        <h2 className={`${labelClass} mb-3`}>Préstamos</h2>
        {loans.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-6 text-[15px] italic">
            No hay préstamos registrados
          </p>
        ) : (
          loans.map((loan) => (
            <LoanBlock
              key={loan.id}
              loan={loan}
              accounts={accounts
                .filter((a) => a.currency === loan.currency && a.type !== "credit_card")
                .map((a) => ({ id: a.id, name: a.name }))}
            />
          ))
        )}
      </section>

      <section>
        <h2 className={`${labelClass} mb-3`}>Entre personas</h2>
        <DebtList debts={debts} />
      </section>
    </div>
  );
}

// --- Tarjetas ----------------------------------------------------------------

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

function CardBlock({
  card,
  payAccounts,
}: {
  card: CardView;
  payAccounts: { id: string; name: string; currency: Currency }[];
}) {
  const { account, balanceMinor, limitMinor, availableMinor, statements, plans } = card;
  // Lo que conviene ofrecer pagar: lo que falta del estado de cuenta cerrado y la deuda total.
  const suggestions = [
    ...(card.billedPayment && card.billedPayment.remainingMinor > 0n
      ? [{ label: "estado de cuenta", amountMinor: card.billedPayment.remainingMinor }]
      : statements?.billed && statements.billed.totalMinor > 0n
        ? [{ label: "estado de cuenta", amountMinor: statements.billed.totalMinor }]
        : []),
    ...(balanceMinor < 0n ? [{ label: "deuda total", amountMinor: -balanceMinor }] : []),
  ];
  const nextDue = statements ? (statements.billed ?? statements.open).dueDate : null;
  const used =
    limitMinor !== null && availableMinor !== null
      ? budgetStatus(limitMinor - availableMinor, limitMinor)
      : null;
  const usedTone: ProgressTone =
    used?.status === "over"
      ? "danger"
      : used?.status === "warning"
        ? "warning"
        : "neutral";

  const active = plans.filter((p) => p.progress.next !== null);
  const finished = plans.filter((p) => p.progress.next === null);

  return (
    <div className="border-border flex flex-col gap-6 border-t pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[17px] italic">
          {account.name}
          {account.institution ? (
            <span className="text-muted-foreground not-italic">
              {" "}
              · {account.institution}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <PayCardDialog
            cardId={account.id}
            cardName={account.name}
            currency={account.currency}
            accounts={payAccounts}
            suggestions={suggestions}
          />
          <CardSettingsDialog
            accountId={account.id}
            name={account.name}
            currency={account.currency}
            closeDay={account.statement_close_day}
            dueDay={account.payment_due_day}
            limitMinor={limitMinor}
            configured={card.days !== null}
          />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-5 md:grid-cols-4">
        <Stat label="Saldo actual">
          <Amount
            amountMinor={balanceMinor}
            currency={account.currency}
            withSymbol
            tone={balanceMinor < 0n ? "expense" : "neutral"}
            signDisplay="always"
            className="text-xl"
          />
        </Stat>
        <Stat label="Cupo disponible">
          {availableMinor !== null ? (
            <Amount
              amountMinor={availableMinor}
              currency={account.currency}
              withSymbol
              tone={availableMinor < 0n ? "expense" : "neutral"}
              className="text-xl"
            />
          ) : (
            <span className="text-muted-foreground font-mono text-[12px]">
              sin cupo definido
            </span>
          )}
        </Stat>
        <Stat label="Cierra">
          <span className="font-mono text-xl">
            {statements ? formatShortDay(statements.open.closeDate) : "—"}
          </span>
        </Stat>
        <Stat label="Vence">
          <span className="font-mono text-xl">
            {nextDue ? formatShortDay(nextDue) : "—"}
          </span>
        </Stat>
      </div>

      {used && limitMinor !== null ? (
        <div className="flex flex-col gap-1.5">
          <ProgressLine
            percent={used.percent}
            tone={usedTone}
            label={`${account.name}: ${used.percent}% del cupo usado`}
          />
          <span className="text-muted-foreground font-mono text-[10px] uppercase">
            cupo usado {used.percent}%
            {used.status === "warning" ? " · cerca del límite" : ""}
            {used.status === "over" ? " · en el límite" : ""}
          </span>
        </div>
      ) : null}

      {statements ? (
        <div className="flex flex-col">
          {statements.billed ? (
            <StatementRow
              title="Estado de cuenta cerrado"
              statement={statements.billed}
              currency={account.currency}
              note={`cerró el ${formatShortDay(statements.billed.closeDate)}`}
              payment={card.billedPayment}
            />
          ) : null}
          <StatementRow
            title="Ciclo en curso"
            statement={statements.open}
            currency={account.currency}
            note={`cierra el ${formatShortDay(statements.open.closeDate)} · estimado`}
          />
          <p className="text-muted-foreground mt-2 font-mono text-[10px]">
            El total suma las compras de contado del periodo y las cuotas que se cobran
            ese día. Los pagos que hagas entre el cierre y el vencimiento marcan el estado
            de cuenta como pagado.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground font-mono text-[11px]">
          Configura el día de cierre y de pago para ver los estados de cuenta y poder
          cargar compras en cuotas.
        </p>
      )}

      <div>
        <h3 className={`${labelClass} mb-1`}>Compras en cuotas</h3>
        {active.length === 0 ? (
          <p className="border-border text-muted-foreground border-t py-4 text-[14px] italic">
            No hay compras en cuotas activas
          </p>
        ) : (
          active.map((plan) => (
            <PlanRow key={plan.id} plan={plan} currency={account.currency} />
          ))
        )}
        {finished.length > 0 ? (
          <details className="mt-2">
            <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
              {finished.length}{" "}
              {finished.length === 1 ? "compra terminada" : "compras terminadas"}
            </summary>
            {finished.map((plan) => (
              <PlanRow key={plan.id} plan={plan} currency={account.currency} />
            ))}
          </details>
        ) : null}
      </div>
    </div>
  );
}

function StatementRow({
  title,
  statement,
  currency,
  note,
  payment,
}: {
  title: string;
  statement: Statement;
  currency: Currency;
  note: string;
  payment?: PaymentStatus | null;
}) {
  return (
    <div className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-2.5">
      <span className="flex-1 text-[14px] italic">{title}</span>
      <span className="text-muted-foreground font-mono text-[10px] uppercase">
        {note} · vence {formatShortDay(statement.dueDate)}
        {payment
          ? payment.status === "paid"
            ? " · pagado"
            : payment.status === "partial"
              ? " · pagado en parte"
              : " · sin pagar"
          : ""}
      </span>
      <Amount
        amountMinor={-statement.totalMinor}
        currency={currency}
        withSymbol
        tone="expense"
        signDisplay="always"
        className="text-[13.5px]"
      />
    </div>
  );
}

function PlanRow({ plan, currency }: { plan: CardPlanView; currency: Currency }) {
  const { progress } = plan;
  const name = plan.merchant || "Compra en cuotas";

  return (
    <div className="border-border group flex flex-col gap-1 border-t py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex-1 text-[14px] italic">{name}</span>
        <span className="font-mono text-[11px]">
          {progress.next
            ? `cuota ${progress.next.number} de ${plan.count}`
            : `${plan.count} cuotas pagadas`}
        </span>
        {progress.next ? (
          <>
            <span className="text-muted-foreground font-mono text-[10px] uppercase">
              prox. {formatShortDay(progress.next.dueDate)}
            </span>
            <Amount
              amountMinor={-progress.next.amountMinor}
              currency={currency}
              withSymbol
              tone="expense"
              signDisplay="always"
              className="text-[13px]"
            />
          </>
        ) : null}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] uppercase">
        <span>
          compra del {formatShortDay(plan.purchaseDate)} ·{" "}
          <Amount
            amountMinor={plan.totalMinor}
            currency={currency}
            withSymbol
            tone="neutral"
          />
        </span>
        {progress.remainingCount > 0 ? (
          <span>
            · quedan {progress.remainingCount}{" "}
            {progress.remainingCount === 1 ? "cuota" : "cuotas"} (
            <Amount
              amountMinor={progress.remainingMinor}
              currency={currency}
              withSymbol
              tone="neutral"
            />
            )
          </span>
        ) : null}
        <span className="ml-auto md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <DeletePlanPurchaseButton transactionId={plan.transactionId} name={name} />
        </span>
      </div>
    </div>
  );
}

// --- Prestamos ---------------------------------------------------------------

function LoanBlock({
  loan,
  accounts,
}: {
  loan: LoanView;
  accounts: { id: string; name: string }[];
}) {
  const { summary } = loan;
  const today = todayISO();

  return (
    <div className="border-border group flex flex-col gap-4 border-t py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[16px] italic">
          {loan.name}
          {loan.lender ? (
            <span className="text-muted-foreground not-italic"> · {loan.lender}</span>
          ) : null}
        </span>
        <span className="flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <LoanDialog
            loan={{
              id: loan.id,
              name: loan.name,
              lender: loan.lender,
              currency: loan.currency,
              principal: fromMinorUnits(loan.principalMinor, loan.currency),
              installment: fromMinorUnits(loan.installmentMinor, loan.currency),
              count: loan.count,
              firstDueDate: loan.firstDueDate,
            }}
          />
          <DeleteLoanButton loanId={loan.id} name={loan.name} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4">
        <Stat label="Capital pendiente">
          <Amount
            amountMinor={-summary.outstandingMinor}
            currency={loan.currency}
            withSymbol
            tone={summary.outstandingMinor > 0n ? "expense" : "neutral"}
            signDisplay="always"
            className="text-xl"
          />
        </Stat>
        <Stat label="Cuota mensual">
          <Amount
            amountMinor={loan.installmentMinor}
            currency={loan.currency}
            withSymbol
            tone="neutral"
            className="text-xl"
          />
        </Stat>
        <Stat label="Cuotas restantes">
          <span className="font-mono text-xl">
            {summary.remainingCount} de {loan.count}
          </span>
        </Stat>
        <Stat label="Próxima cuota">
          <span className="font-mono text-xl">
            {summary.next ? formatShortDay(summary.next.dueDate) : "terminado"}
          </span>
        </Stat>
      </div>

      <p className="text-muted-foreground font-mono text-[10.5px]">
        Tasa implícita {percentFormat.format(loan.monthlyRate * 100)}% mensual · intereses
        totales{" "}
        <Amount
          amountMinor={summary.totalInterestMinor}
          currency={loan.currency}
          withSymbol
          tone="neutral"
        />{" "}
        · las cuotas anteriores a hoy se dan por pagadas
      </p>

      {loan.savings ? (
        <p className="text-muted-foreground font-mono text-[10.5px]">
          Tus abonos te ahorran{" "}
          <Amount
            amountMinor={loan.savings.interestSavedMinor}
            currency={loan.currency}
            withSymbol
            tone="income"
          />{" "}
          en intereses
          {loan.savings.installmentsSaved > 0
            ? ` y ${loan.savings.installmentsSaved} ${loan.savings.installmentsSaved === 1 ? "cuota" : "cuotas"}`
            : ""}
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {summary.outstandingMinor > 0n ? (
          <PrepaymentDialog
            loanId={loan.id}
            name={loan.name}
            currency={loan.currency}
            terms={loan.terms}
            existing={loan.prepayments}
            accounts={accounts}
          />
        ) : null}
      </div>

      {loan.prepayments.length > 0 ? (
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[9.5px] uppercase">
            Abonos extraordinarios
          </div>
          {loan.prepayments.map((p) => (
            <div
              key={p.id}
              className="border-border flex items-baseline gap-3 border-t py-1.5 text-[13px]"
            >
              <span className="text-muted-foreground w-14 shrink-0 font-mono text-[10px]">
                {formatShortDay(p.paidOn)}
              </span>
              <span className="flex-1 truncate italic">
                {p.mode === "shorten_term" ? "terminar antes" : "bajar la cuota"}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <Amount
                amountMinor={p.amountMinor}
                currency={loan.currency}
                tone="neutral"
                className="text-[12.5px]"
              />
              <DeletePrepaymentButton prepaymentId={p.id} />
            </div>
          ))}
        </div>
      ) : null}

      <details>
        <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
          tabla de amortización
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] font-mono text-[11.5px] tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-left text-[9.5px] uppercase">
                <th className="py-1.5 pr-3 font-normal">N°</th>
                <th className="py-1.5 pr-3 font-normal">Fecha</th>
                <th className="py-1.5 pr-3 text-right font-normal">Cuota</th>
                <th className="py-1.5 pr-3 text-right font-normal">Interés</th>
                <th className="py-1.5 pr-3 text-right font-normal">Capital</th>
                <th className="py-1.5 pr-3 text-right font-normal">Abono</th>
                <th className="py-1.5 text-right font-normal">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loan.rows.map((row) => (
                <tr
                  key={row.number}
                  className={`border-border border-t ${row.dueDate < today ? "text-muted-foreground" : ""}`}
                >
                  <td className="py-1.5 pr-3">{row.number}</td>
                  <td className="py-1.5 pr-3">
                    {formatShortDay(row.dueDate)} {row.dueDate.slice(0, 4)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Amount
                      amountMinor={row.installmentMinor}
                      currency={loan.currency}
                      tone="neutral"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Amount
                      amountMinor={row.interestMinor}
                      currency={loan.currency}
                      tone="neutral"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Amount
                      amountMinor={row.capitalMinor}
                      currency={loan.currency}
                      tone="neutral"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {row.extraMinor > 0n ? (
                      <Amount
                        amountMinor={row.extraMinor}
                        currency={loan.currency}
                        tone="neutral"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <Amount
                      amountMinor={row.balanceMinor}
                      currency={loan.currency}
                      tone="neutral"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// --- Deudas entre personas ---------------------------------------------------

function DebtList({ debts }: { debts: PersonalDebtView[] }) {
  if (debts.length === 0) {
    return (
      <p className="border-border text-muted-foreground border-t py-6 text-[15px] italic">
        No hay deudas entre personas
      </p>
    );
  }

  // Saldo neto de lo que sigue abierto, por moneda (no se mezclan monedas).
  const net = new Map<Currency, bigint>();
  for (const debt of debts) {
    if (debt.settledOn) continue;
    const signed = debt.direction === "lent" ? debt.amountMinor : -debt.amountMinor;
    net.set(debt.currency, (net.get(debt.currency) ?? 0n) + signed);
  }

  return (
    <div>
      {net.size > 0 ? (
        <p className="text-muted-foreground mb-2 font-mono text-[10.5px]">
          Saldo neto abierto:{" "}
          {[...net.entries()].map(([currency, amount], i) => (
            <span key={currency}>
              {i > 0 ? " · " : ""}
              <Amount
                amountMinor={amount}
                currency={currency}
                withSymbol
                tone="auto"
                signDisplay="always"
              />
            </span>
          ))}{" "}
          (positivo = te deben más de lo que debes)
        </p>
      ) : null}
      {debts.map((debt) => (
        <div
          key={debt.id}
          className={`border-border group flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-2.5 ${debt.settledOn ? "opacity-60" : ""}`}
        >
          <span className="flex-1 text-[14px] italic">
            {debt.direction === "lent" ? "Le presté a " : "Le debo a "}
            {debt.person}
          </span>
          <span className="text-muted-foreground font-mono text-[10px] uppercase">
            {debt.settledOn
              ? `saldada el ${formatShortDay(debt.settledOn)}`
              : `desde ${formatShortDay(debt.occurredOn)}`}
            {debt.notes ? ` · ${debt.notes}` : ""}
          </span>
          <Amount
            amountMinor={debt.direction === "lent" ? debt.amountMinor : -debt.amountMinor}
            currency={debt.currency}
            withSymbol
            tone="auto"
            signDisplay="always"
            className="text-[13.5px]"
          />
          <span className="flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
            <SettleDebtButton debtId={debt.id} settled={debt.settledOn !== null} />
            <DeleteDebtButton debtId={debt.id} person={debt.person} />
          </span>
        </div>
      ))}
    </div>
  );
}
