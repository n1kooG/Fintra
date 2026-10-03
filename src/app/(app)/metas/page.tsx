import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getGoals, type GoalView } from "@/server/queries/goals";
import { Amount } from "@/components/money/amount";
import { BudgetsTabs } from "@/components/budgets/budgets-tabs";
import { ProgressLine, type ProgressTone } from "@/components/budgets/progress-line";
import type { GoalStatus } from "@/lib/goals";
import { formatMonthLabel, formatShortDay, monthKeyOf, todayISO } from "@/lib/dates";
import { ContributionDialog, GoalDialog } from "./goal-dialogs";
import { DeleteContributionButton, DeleteGoalButton } from "./goal-actions";

const TONE: Record<GoalStatus, ProgressTone> = {
  completed: "good",
  on_track: "neutral",
  no_date: "neutral",
  no_pace: "neutral",
  behind: "warning",
};

export default async function MetasPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const goals = await getGoals(current.householdId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Metas de ahorro</h1>
        <GoalDialog />
      </div>

      <BudgetsTabs active="/metas" />

      {goals.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-2 border-t py-16 text-center">
          <p className="text-muted-foreground text-[15px] italic">
            Todavía no tienes metas de ahorro
          </p>
          <p className="text-muted-foreground max-w-sm font-mono text-[11px]">
            Crea una meta con su monto y, si quieres, una fecha. Cada aporte que registres
            te dice si vas a llegar a tiempo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {goals.map((goal) => (
            <GoalItem key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      <p className="text-muted-foreground font-mono text-[10.5px]">
        Los aportes son un registro de la meta: no mueven el saldo de tus cuentas.
      </p>
    </div>
  );
}

function monthYear(dateISO: string) {
  return formatMonthLabel(monthKeyOf(dateISO));
}

/** El estado se dice con palabras (el color solo lo refuerza). */
function statusText(goal: GoalView): string {
  const { status, projectedDate } = goal.progress;
  switch (status) {
    case "completed":
      return "meta cumplida";
    case "on_track":
      return `a tiempo · al ritmo actual se cumple en ${monthYear(projectedDate!)}`;
    case "behind": {
      const expired = goal.targetDate !== null && goal.targetDate <= todayISO();
      const prefix = expired ? "la fecha objetivo ya pasó" : "atrasada";
      return projectedDate
        ? `${prefix} · al ritmo actual se cumple en ${monthYear(projectedDate)}`
        : prefix;
    }
    case "no_date":
      return `al ritmo actual se cumple en ${monthYear(projectedDate!)}`;
    case "no_pace":
      return goal.contributions.length === 0
        ? "sin aportes todavía"
        : "sin aportes en los últimos 90 días";
  }
}

function GoalItem({ goal }: { goal: GoalView }) {
  const { progress } = goal;
  const showRequired =
    progress.requiredPerMonthMinor !== null &&
    (progress.status === "behind" || progress.status === "no_pace");

  return (
    <div className="border-border group flex flex-col gap-2 border-b py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex-1 text-[16px] italic">{goal.name}</span>
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.06em] uppercase">
          {goal.targetDate
            ? `meta ${formatShortDay(goal.targetDate)} ${goal.targetDate.slice(0, 4)}`
            : "sin fecha"}
        </span>
      </div>

      <div className="font-mono text-[12.5px]">
        <Amount
          amountMinor={progress.savedMinor}
          currency={goal.currency}
          tone="neutral"
        />
        <span className="text-muted-foreground">
          {" / "}
          <Amount
            amountMinor={goal.targetMinor}
            currency={goal.currency}
            tone="neutral"
          />
          {" · "}
          {progress.percent}%
        </span>
      </div>

      <ProgressLine
        percent={progress.percent}
        tone={TONE[progress.status]}
        label={`${goal.name}: ${progress.percent}% de la meta`}
      />

      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase">
        <span className={progress.status === "behind" ? "text-expense" : undefined}>
          {statusText(goal)}
        </span>
        {progress.paceMinorPerMonth > 0n && progress.status !== "completed" ? (
          <span>
            · ritmo{" "}
            <Amount
              amountMinor={progress.paceMinorPerMonth}
              currency={goal.currency}
              tone="neutral"
            />
            /mes
          </span>
        ) : null}
        {showRequired ? (
          <span>
            · para llegar a tiempo:{" "}
            <Amount
              amountMinor={progress.requiredPerMonthMinor!}
              currency={goal.currency}
              tone="neutral"
            />
            /mes
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-baseline gap-4">
        {progress.status !== "completed" ? (
          <ContributionDialog
            goalId={goal.id}
            goalName={goal.name}
            currency={goal.currency}
          />
        ) : null}
        <span className="ml-auto flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <GoalDialog goal={goal} />
          <DeleteGoalButton goalId={goal.id} name={goal.name} />
        </span>
      </div>

      {goal.contributions.length > 0 ? (
        <details className="mt-1">
          <summary className="text-muted-foreground cursor-pointer font-mono text-[10px] uppercase">
            {goal.contributions.length}{" "}
            {goal.contributions.length === 1 ? "aporte" : "aportes"}
          </summary>
          <div className="mt-2 flex flex-col">
            {goal.contributions.map((c) => (
              <div
                key={c.id}
                className="border-border flex items-baseline gap-3 border-t py-1.5 text-[13px]"
              >
                <span className="text-muted-foreground w-14 shrink-0 font-mono text-[10px]">
                  {formatShortDay(c.occurredOn)}
                </span>
                <span className="flex-1 truncate italic">{c.notes ?? ""}</span>
                <Amount
                  amountMinor={c.amountMinor}
                  currency={goal.currency}
                  tone="income"
                  signDisplay="always"
                  className="text-[12.5px]"
                />
                <DeleteContributionButton contributionId={c.id} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
