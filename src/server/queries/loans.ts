import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  amortizationSchedule,
  prepaymentSavings,
  summarizeLoan,
  type AmortizationRow,
  type LoanSummary,
  type LoanTerms,
  type Prepayment,
  type PrepaymentMode,
  type PrepaymentSavings,
} from "@/lib/loans";
import { todayISO } from "@/lib/dates";
import type { LoanRow } from "@/lib/supabase/types";

export type PrepaymentView = Prepayment & { id: string; note: string | null };

export type LoanView = {
  id: string;
  name: string;
  lender: string | null;
  currency: LoanRow["currency"];
  principalMinor: bigint;
  installmentMinor: bigint;
  count: number;
  firstDueDate: string;
  /** Lo que dice el contrato, para recalcular con abonos hipoteticos (simulador). */
  terms: LoanTerms;
  /** Tasa mensual implicita (0.015 = 1,5%). */
  monthlyRate: number;
  /** Tabla de amortizacion CON los abonos ya hechos. */
  rows: AmortizationRow[];
  /** Del mas antiguo al mas reciente. */
  prepayments: PrepaymentView[];
  /** Ahorro de los abonos frente a no haberlos hecho; null si no hay abonos. */
  savings: PrepaymentSavings | null;
  summary: LoanSummary;
};

/** Prestamos con su tabla de amortizacion derivada. Uno sin solucion (no deberia existir) se omite. */
export async function getLoans(
  householdId: string,
  client?: SupabaseClient,
): Promise<LoanView[]> {
  const supabase = client ?? (await createClient());
  const [loansResult, prepaymentsResult] = await Promise.all([
    supabase
      .from("loans")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
    supabase
      .from("loan_prepayments")
      .select("id, loan_id, paid_on, amount_minor, mode, note")
      .eq("household_id", householdId)
      .order("paid_on", { ascending: true }),
  ]);
  if (loansResult.error) throw loansResult.error;
  if (prepaymentsResult.error) throw prepaymentsResult.error;

  const byLoan = new Map<string, PrepaymentView[]>();
  for (const p of (prepaymentsResult.data ?? []) as {
    id: string;
    loan_id: string;
    paid_on: string;
    amount_minor: string;
    mode: PrepaymentMode;
    note: string | null;
  }[]) {
    const list = byLoan.get(p.loan_id) ?? [];
    list.push({
      id: p.id,
      paidOn: p.paid_on,
      amountMinor: BigInt(p.amount_minor),
      mode: p.mode,
      note: p.note,
    });
    byLoan.set(p.loan_id, list);
  }

  const today = todayISO();
  const views: LoanView[] = [];
  for (const row of (loansResult.data ?? []) as LoanRow[]) {
    const principalMinor = BigInt(row.principal_minor);
    const installmentMinor = BigInt(row.installment_minor);
    const terms: LoanTerms = {
      principalMinor,
      installmentMinor,
      count: row.installments_count,
      firstDueDate: row.first_due_date,
    };
    const prepayments = byLoan.get(row.id) ?? [];
    const schedule = amortizationSchedule(terms, prepayments);
    if (!schedule) continue;

    views.push({
      id: row.id,
      name: row.name,
      lender: row.lender,
      currency: row.currency,
      principalMinor,
      installmentMinor,
      count: row.installments_count,
      firstDueDate: row.first_due_date,
      terms,
      monthlyRate: schedule.rate,
      rows: schedule.rows,
      prepayments,
      savings: prepaymentSavings(terms, prepayments),
      summary: summarizeLoan(principalMinor, schedule.rows, today, prepayments),
    });
  }
  return views;
}
