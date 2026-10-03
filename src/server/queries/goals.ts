import "server-only";
import { createClient } from "@/lib/supabase/server";
import { goalProgress, type GoalProgress } from "@/lib/goals";
import { todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";

export type ContributionView = {
  id: string;
  amountMinor: bigint;
  occurredOn: string;
  notes: string | null;
};

export type GoalView = {
  id: string;
  name: string;
  currency: Currency;
  targetMinor: bigint;
  targetDate: string | null;
  progress: GoalProgress;
  /** Del mas reciente al mas antiguo. */
  contributions: ContributionView[];
};

export async function getGoals(householdId: string): Promise<GoalView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, currency, target_minor, target_date, created_at, contributions:goal_contributions(id, amount_minor, occurred_on, notes)",
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const today = todayISO();
  return (
    (data ?? []) as unknown as {
      id: string;
      name: string;
      currency: Currency;
      target_minor: string;
      target_date: string | null;
      contributions: {
        id: string;
        amount_minor: string;
        occurred_on: string;
        notes: string | null;
      }[];
    }[]
  ).map((goal) => {
    const contributions: ContributionView[] = goal.contributions
      .map((c) => ({
        id: c.id,
        amountMinor: BigInt(c.amount_minor),
        occurredOn: c.occurred_on,
        notes: c.notes,
      }))
      .sort((a, b) =>
        a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0,
      );

    const targetMinor = BigInt(goal.target_minor);
    return {
      id: goal.id,
      name: goal.name,
      currency: goal.currency,
      targetMinor,
      targetDate: goal.target_date,
      progress: goalProgress(
        { targetMinor, targetDate: goal.target_date, contributions },
        today,
      ),
      contributions,
    };
  });
}
