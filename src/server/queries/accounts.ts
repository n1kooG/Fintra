import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AccountRow } from "@/lib/supabase/types";
import type { Currency } from "@/lib/money";
import { consolidateBalances } from "@/lib/reports";
import { todayISO } from "@/lib/dates";
import { loadRateBook } from "@/server/fx/rates";
import { getLoans } from "./loans";
import { getHoldings } from "./investments";
import { fetchAll } from "./paginate";

export async function getAccounts(householdId: string): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export type AccountWithBalance = AccountRow & { balanceMinor: bigint };

/**
 * Saldo actual de cada cuenta = saldo inicial + suma de sus movimientos
 * (los montos ya vienen firmados: ingreso positivo, gasto y salida de
 * transferencia negativos — ver src/server/actions/transactions.ts).
 * Los movimientos se traen paginados (ver fetchAll) y se suman en memoria,
 * en vez de una consulta por cuenta.
 */
export async function getAccountsWithBalances(
  householdId: string,
  client?: SupabaseClient,
): Promise<AccountWithBalance[]> {
  const supabase = client ?? (await createClient());

  const [{ data: accounts, error: accountsError }, txs] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("created_at", { ascending: true }),
    fetchAll<{ account_id: string; amount_minor: string }>((from, to) =>
      supabase
        .from("transactions")
        .select("account_id, amount_minor")
        .eq("household_id", householdId)
        .order("id")
        .range(from, to),
    ),
  ]);

  if (accountsError) throw accountsError;

  const balanceByAccount = new Map<string, bigint>();
  for (const tx of txs) {
    const prev = balanceByAccount.get(tx.account_id) ?? 0n;
    balanceByAccount.set(tx.account_id, prev + BigInt(tx.amount_minor));
  }

  return (accounts ?? []).map((account) => ({
    ...account,
    balanceMinor:
      BigInt(account.initial_balance_minor) + (balanceByAccount.get(account.id) ?? 0n),
  }));
}

export async function getAccountById(
  householdId: string,
  accountId: string,
): Promise<AccountRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Saldos de cada cuenta mas activos, pasivos y patrimonio neto
 * consolidados en la moneda de visualizacion, a la cotizacion de hoy.
 * El capital pendiente de los prestamos registrados (src/lib/loans.ts)
 * cuenta como pasivo, igual que el saldo de una tarjeta o de una cuenta
 * de tipo prestamo; el valor de los instrumentos de inversion activos
 * (src/lib/investments.ts) cuenta como activo.
 */
export async function getAccountsOverview(
  householdId: string,
  displayCurrency: Currency,
) {
  const today = todayISO();
  const supabase = await createClient();
  const [accounts, book, loans, holdings] = await Promise.all([
    getAccountsWithBalances(householdId),
    loadRateBook(supabase, today, today),
    getLoans(householdId),
    getHoldings(householdId),
  ]);
  const holdingAssets = holdings
    .filter((holding) => !holding.archived && holding.metrics.valueMinor > 0n)
    .map((holding) => ({
      id: `holding:${holding.id}`,
      type: "investment" as const,
      currency: holding.currency,
      balanceMinor: holding.metrics.valueMinor,
    }));
  const loanLiabilities = loans
    .filter((loan) => loan.summary.outstandingMinor > 0n)
    .map((loan) => ({
      id: `loan:${loan.id}`,
      type: "loan" as const,
      currency: loan.currency,
      balanceMinor: -loan.summary.outstandingMinor,
    }));
  return {
    accounts,
    netWorth: consolidateBalances(
      [...accounts, ...loanLiabilities, ...holdingAssets],
      displayCurrency,
      book,
      today,
    ),
  };
}
