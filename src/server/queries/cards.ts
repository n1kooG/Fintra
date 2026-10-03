import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  availableCredit,
  currentStatements,
  statementPayment,
  type PaymentStatus,
  planProgress,
  planSchedule,
  type CardDays,
  type InstallmentEntry,
  type PlanProgress,
  type Statement,
} from "@/lib/cards";
import type { CardPaymentInput, ChargeInput, PlanInput } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { addDays } from "@/lib/recurrence";
import type { AccountRow } from "@/lib/supabase/types";
import { getAccountsWithBalances } from "./accounts";

export type CardPlanData = PlanInput & {
  transactionId: string;
  merchant: string | null;
  purchaseDate: string;
};

export type CardData = {
  cards: AccountRow[];
  plans: CardPlanData[];
  /** Compras de contado (monto positivo): gastos en tarjetas que NO forman parte de un plan de cuotas. */
  charges: ChargeInput[];
  /** Transferencias que entran a una tarjeta (pagos), desde `chargesFrom`. */
  payments: CardPaymentInput[];
};

/**
 * Tarjetas de credito activas con sus planes de cuotas y las compras de
 * contado desde `chargesFrom` (alcanza con ~100 dias para cubrir el
 * estado de cuenta cerrado y el ciclo abierto). Lo comparten la pantalla
 * de Tarjetas y el calendario.
 */
export async function getCardData(
  householdId: string,
  chargesFrom: string,
  client?: SupabaseClient,
): Promise<CardData> {
  const supabase = client ?? (await createClient());
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", householdId)
    .eq("type", "credit_card")
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const cards = (accounts ?? []) as AccountRow[];
  if (cards.length === 0) return { cards: [], plans: [], charges: [], payments: [] };
  const ids = cards.map((c) => c.id);

  const [plansResult, txResult, paymentsResult] = await Promise.all([
    supabase
      .from("installment_plans")
      .select(
        "id, account_id, transaction_id, installments_count, total_minor, first_due_date, due_day, transaction:transactions(merchant, occurred_on)",
      )
      .eq("household_id", householdId)
      .in("account_id", ids),
    supabase
      .from("transactions")
      .select("id, account_id, amount_minor, occurred_on")
      .eq("household_id", householdId)
      .in("account_id", ids)
      .eq("type", "expense")
      .gte("occurred_on", chargesFrom),
    // Pagos: la pierna de entrada (positiva) de una transferencia a la tarjeta.
    supabase
      .from("transactions")
      .select("account_id, amount_minor, occurred_on")
      .eq("household_id", householdId)
      .in("account_id", ids)
      .eq("type", "transfer")
      .gt("amount_minor", 0)
      .gte("occurred_on", chargesFrom),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (txResult.error) throw txResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const plans: CardPlanData[] = (
    (plansResult.data ?? []) as unknown as {
      id: string;
      account_id: string;
      transaction_id: string;
      installments_count: number;
      total_minor: string;
      first_due_date: string;
      due_day: number;
      transaction: { merchant: string | null; occurred_on: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    accountId: row.account_id,
    transactionId: row.transaction_id,
    count: row.installments_count,
    totalMinor: BigInt(row.total_minor),
    firstDueDate: row.first_due_date,
    dueDay: row.due_day,
    merchant: row.transaction?.merchant ?? null,
    purchaseDate: row.transaction?.occurred_on ?? row.first_due_date,
  }));

  // Una compra en cuotas se factura por sus cuotas, no como compra de contado.
  const planTransactions = new Set(plans.map((p) => p.transactionId));
  const charges: ChargeInput[] = [];
  for (const tx of txResult.data ?? []) {
    const amount = BigInt(tx.amount_minor);
    if (planTransactions.has(tx.id) || amount >= 0n) continue;
    charges.push({
      accountId: tx.account_id,
      date: tx.occurred_on,
      amountMinor: -amount,
    });
  }

  const payments: CardPaymentInput[] = (paymentsResult.data ?? []).map(
    (tx: { account_id: string; amount_minor: string; occurred_on: string }) => ({
      accountId: tx.account_id,
      date: tx.occurred_on,
      amountMinor: BigInt(tx.amount_minor),
    }),
  );

  return { cards, plans, charges, payments };
}

export type CardPlanView = CardPlanData & {
  schedule: InstallmentEntry[];
  progress: PlanProgress;
};

export type CardView = {
  account: AccountRow;
  balanceMinor: bigint;
  limitMinor: bigint | null;
  availableMinor: bigint | null;
  /** null mientras la tarjeta no tenga configurados el dia de cierre y de pago. */
  days: CardDays | null;
  statements: { billed: Statement | null; open: Statement } | null;
  /** Cuanto se pago del estado de cuenta cerrado (null si no hay uno por pagar). */
  billedPayment: PaymentStatus | null;
  plans: CardPlanView[];
};

/** Todo lo que muestra la pantalla de Tarjetas: saldo, cupo, ciclo, estados de cuenta y cuotas. */
export async function getCardsOverview(
  householdId: string,
  client?: SupabaseClient,
): Promise<CardView[]> {
  const today = todayISO();
  const [data, accounts] = await Promise.all([
    getCardData(householdId, addDays(today, -100), client),
    getAccountsWithBalances(householdId, client),
  ]);
  const balances = new Map(accounts.map((a) => [a.id, a.balanceMinor]));

  return data.cards.map((account): CardView => {
    const balanceMinor = balances.get(account.id) ?? 0n;
    const limitMinor =
      account.credit_limit_minor === null ? null : BigInt(account.credit_limit_minor);
    const days: CardDays | null =
      account.statement_close_day !== null && account.payment_due_day !== null
        ? { closeDay: account.statement_close_day, dueDay: account.payment_due_day }
        : null;

    const plans: CardPlanView[] = data.plans
      .filter((plan) => plan.accountId === account.id)
      .map((plan) => {
        const schedule = planSchedule(plan);
        return { ...plan, schedule, progress: planProgress(schedule, today) };
      })
      // Primero las que todavia tienen cuotas por cobrar, la proxima a vencer arriba.
      .sort(
        (a, b) =>
          Number(a.progress.next === null) - Number(b.progress.next === null) ||
          (a.progress.next?.dueDate ?? "").localeCompare(b.progress.next?.dueDate ?? ""),
      );

    const statements = days
      ? currentStatements({
          today,
          days,
          charges: data.charges
            .filter((c) => c.accountId === account.id)
            .map(({ date, amountMinor }) => ({ date, amountMinor })),
          schedules: plans.map((p) => p.schedule),
        })
      : null;

    return {
      account,
      balanceMinor,
      limitMinor,
      availableMinor: availableCredit(limitMinor, balanceMinor),
      days,
      statements,
      billedPayment: statements?.billed
        ? statementPayment(
            statements.billed,
            data.payments
              .filter((p) => p.accountId === account.id)
              .map(({ date, amountMinor }) => ({ date, amountMinor })),
          )
        : null,
      plans,
    };
  });
}
