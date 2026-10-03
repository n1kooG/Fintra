import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccounts } from "@/server/queries/accounts";
import { getCategories } from "@/server/queries/categories";
import {
  getRecurringRules,
  upcomingOccurrences,
  type RecurringRuleWithRelations,
} from "@/server/queries/recurring";
import { Amount } from "@/components/money/amount";
import { FREQUENCY_LABEL } from "@/lib/recurrence";
import { formatShortDay, todayISO } from "@/lib/dates";
import { RecurringRuleDialog } from "./recurring-rule-dialog";
import { RuleActions } from "./rule-actions";

function signedAmount(rule: RecurringRuleWithRelations) {
  const magnitude = BigInt(rule.amount_minor);
  return rule.type === "expense" ? -magnitude : magnitude;
}

export default async function RecurrentesPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const [rules, accounts, categories] = await Promise.all([
    getRecurringRules(current.householdId),
    getAccounts(current.householdId),
    getCategories(current.householdId),
  ]);
  const upcoming = upcomingOccurrences(rules, 30);
  const active = rules.filter((r) => r.active);
  const inactive = rules.filter((r) => !r.active);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium md:text-[23px]">Recurrentes</h1>
        {accounts.length > 0 ? (
          <RecurringRuleDialog accounts={accounts} categories={categories} />
        ) : null}
      </div>

      {rules.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-2 border-t py-16 text-center">
          <p className="text-muted-foreground text-[15px] italic">
            Todavía no hay movimientos recurrentes
          </p>
          <p className="text-muted-foreground max-w-sm font-mono text-[11px]">
            Sueldo, arriendo, suscripciones: se crean acá o marcando «Repetir» al cargar
            un movimiento, y se generan solos en su fecha.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-8">
            <RuleGroup
              title="Activos"
              rules={active}
              accounts={accounts}
              categories={categories}
            />
            <RuleGroup
              title="Pausados o terminados"
              rules={inactive}
              accounts={accounts}
              categories={categories}
            />
          </div>

          <div>
            <div className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
              Próximos 30 días
            </div>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground font-mono text-[11px]">
                Nada programado en los próximos 30 días
              </p>
            ) : (
              upcoming.map(({ date, rule }) => (
                <div
                  key={`${rule.id}-${date}`}
                  className="border-border flex items-baseline gap-3 border-b py-2"
                >
                  <span className="text-muted-foreground w-12 shrink-0 font-mono text-[10px]">
                    {formatShortDay(date)}
                  </span>
                  <span className="flex-1 truncate text-[13.5px] italic">
                    {rule.merchant || rule.category?.name || "Recurrente"}
                  </span>
                  <Amount
                    amountMinor={signedAmount(rule)}
                    currency={rule.currency}
                    signDisplay="always"
                    className="text-[12.5px]"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleGroup({
  title,
  rules,
  accounts,
  categories,
}: {
  title: string;
  rules: RecurringRuleWithRelations[];
  accounts: Awaited<ReturnType<typeof getAccounts>>;
  categories: Awaited<ReturnType<typeof getCategories>>;
}) {
  if (rules.length === 0) return null;
  const today = todayISO();

  return (
    <div>
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        {title}
      </div>
      {rules.map((rule) => {
        const ended = Boolean(rule.end_date && rule.end_date < today);
        return (
          <div
            key={rule.id}
            className="border-border group flex flex-col gap-1 border-b py-3"
          >
            <div className="flex items-baseline gap-3">
              <span className="flex-1 truncate text-[14.5px] italic">
                {rule.merchant || rule.category?.name || "Recurrente"}
              </span>
              <Amount
                amountMinor={signedAmount(rule)}
                currency={rule.currency}
                signDisplay="always"
                className="text-[13.5px]"
              />
            </div>
            <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase">
              <span>{FREQUENCY_LABEL[rule.frequency]}</span>
              <span>{rule.category?.name ?? "Sin categoría"}</span>
              <span>{rule.account?.name}</span>
              <span>
                {rule.active
                  ? `próximo ${formatShortDay(rule.next_run_on)}`
                  : ended
                    ? "terminado"
                    : "pausado"}
              </span>
              <span className="ml-auto flex gap-3 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                <RecurringRuleDialog
                  accounts={accounts}
                  categories={categories}
                  rule={rule}
                />
                <RuleActions ruleId={rule.id} active={rule.active} canResume={!ended} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
