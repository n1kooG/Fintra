import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  buildBudgetMonth,
  type BudgetInput,
  type BudgetMonth,
  type Commitment,
  type TotalCap,
} from "@/lib/budgeting";
import { daysBetween, monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import type { ReportTransaction } from "@/lib/reports";
import { loadRateBook } from "@/server/fx/rates";
import { getCategoryTree } from "./categories";
import { getRecurringRules, upcomingOccurrences } from "./recurring";
import { categoryLabels, rollUpToBudgeted } from "@/lib/categories";

/**
 * Presupuestos de un mes con lo gastado en cada categoria, avance y
 * estado, mas los totales y el "disponible por dia" (solo mes en curso)
 * en la moneda de visualizacion. Ver src/lib/budgeting.ts para las reglas.
 */
export async function getBudgetMonth(
  householdId: string,
  monthKey: string,
  display: Currency,
  client?: SupabaseClient,
): Promise<BudgetMonth> {
  const today = todayISO();
  const { from, to } = monthBounds(monthKey);
  const supabase = client ?? (await createClient());
  const isCurrent = today >= from && today <= to;

  // Un mes futuro no tiene cotizaciones propias: se parte de hoy para
  // que la ventana hacia atras alcance las ultimas publicadas.
  const bookFrom = from > today ? today : from;
  const previousMonth = shiftMonth(monthKey, -1);
  const previous = monthBounds(previousMonth);

  const [budgetsResult, expensesResult, totalResult, book, tree, rules] =
    await Promise.all([
      supabase
        .from("budgets")
        .select(
          "id, category_id, amount_minor, currency, rollover, category:categories(name)",
        )
        .eq("household_id", householdId)
        .eq("month", from),
      supabase
        .from("transactions")
        .select(
          "type, amount_minor, currency, fx_rate, occurred_on, category_id, category:categories(id, name)",
        )
        .eq("household_id", householdId)
        .eq("type", "expense")
        .gte("occurred_on", from)
        .lte("occurred_on", to),
      supabase
        .from("budget_totals")
        .select("id, amount_minor, currency")
        .eq("household_id", householdId)
        .eq("month", from)
        .maybeSingle(),
      loadRateBook(supabase, previous.from < bookFrom ? previous.from : bookFrom, to),
      getCategoryTree(householdId, supabase),
      // Los recurrentes que faltan solo importan en el mes en curso.
      isCurrent ? getRecurringRules(householdId, supabase) : Promise.resolve([]),
    ]);
  if (budgetsResult.error) throw budgetsResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (totalResult.error) throw totalResult.error;

  const labels = categoryLabels(tree);
  const budgets: BudgetInput[] = (
    (budgetsResult.data ?? []) as unknown as {
      id: string;
      category_id: string;
      amount_minor: string;
      currency: Currency;
      rollover: boolean;
      category: { name: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: labels.get(row.category_id) ?? row.category?.name ?? "Sin nombre",
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
    rollover: row.rollover,
  }));
  const budgetedIds = new Set(budgets.map((b) => b.categoryId));

  // Arrastre: presupuestos y gasto del mes anterior, solo si algun presupuesto lo pide.
  let previousData: { budgets: BudgetInput[]; expenses: ReportTransaction[] } | undefined;
  if (budgets.some((b) => b.rollover)) {
    const [prevBudgets, prevExpenses] = await Promise.all([
      supabase
        .from("budgets")
        .select("id, category_id, amount_minor, currency")
        .eq("household_id", householdId)
        .eq("month", previous.from),
      supabase
        .from("transactions")
        .select(
          "type, amount_minor, currency, fx_rate, occurred_on, category_id, category:categories(id, name)",
        )
        .eq("household_id", householdId)
        .eq("type", "expense")
        .gte("occurred_on", previous.from)
        .lte("occurred_on", previous.to),
    ]);
    if (prevBudgets.error) throw prevBudgets.error;
    if (prevExpenses.error) throw prevExpenses.error;
    const priorBudgets: BudgetInput[] = (
      (prevBudgets.data ?? []) as unknown as {
        id: string;
        category_id: string;
        amount_minor: string;
        currency: Currency;
      }[]
    ).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      categoryName: "",
      amountMinor: BigInt(row.amount_minor),
      currency: row.currency,
    }));
    previousData = {
      budgets: priorBudgets,
      expenses: rollUpToBudgeted(
        (prevExpenses.data ?? []) as unknown as ReportTransaction[],
        tree,
        new Set(priorBudgets.map((b) => b.categoryId)),
      ),
    };
  }

  // Comprometido: recurrentes de gasto que todavia no ocurren este mes. Cuentan
  // para la categoria con presupuesto que los cubra (propia o principal).
  let commitments: Commitment[] = [];
  if (isCurrent) {
    const daysToEnd = daysBetween(today, to);
    const covering = rollUpToBudgeted(
      upcomingOccurrences(rules, daysToEnd, today)
        .filter((o) => o.rule.type === "expense" && o.date <= to)
        .map((o) => ({
          category_id: o.rule.category_id,
          amountMinor: BigInt(o.rule.amount_minor),
          currency: o.rule.currency as Currency,
        })),
      tree,
      budgetedIds,
    );
    commitments = covering.map((c) => ({
      categoryId: c.category_id ?? null,
      amountMinor: c.amountMinor,
      currency: c.currency,
    }));
  }

  const totalRow = totalResult.data as {
    id: string;
    amount_minor: string;
    currency: Currency;
  } | null;
  const totalCap: TotalCap | null = totalRow
    ? {
        id: totalRow.id,
        amountMinor: BigInt(totalRow.amount_minor),
        currency: totalRow.currency,
      }
    : null;

  return buildBudgetMonth({
    monthKey,
    today,
    display,
    budgets,
    // El presupuesto de una categoria principal incluye lo gastado en sus
    // subcategorias (salvo las que tienen presupuesto propio).
    expenses: rollUpToBudgeted(
      (expensesResult.data ?? []) as unknown as ReportTransaction[],
      tree,
      budgetedIds,
    ),
    book,
    commitments,
    totalCap,
    previous: previousData,
  });
}

/** Cuantos presupuestos tiene un mes (para ofrecer copiar el anterior cuando esta vacio). */
export async function countBudgets(
  householdId: string,
  monthKey: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("budgets")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("month", monthBounds(monthKey).from);
  if (error) throw error;
  return count ?? 0;
}
