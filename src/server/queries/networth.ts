import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  earliestActivity,
  netWorthSeries,
  seriesDates,
  type NetWorthPoint,
  type NwHolding,
  type NwLoan,
  type NwTransaction,
} from "@/lib/networth";
import { todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import type { AccountType } from "@/lib/supabase/types";
import { priceLookupFor } from "@/lib/holding-value";
import { rateAtFromBook } from "@/lib/holding-view";
import { loadRateBook } from "@/server/fx/rates";
import { fetchAll } from "./paginate";
import { getHoldings } from "./investments";
import { getLoans } from "./loans";

/**
 * Curva del patrimonio neto: cierre de cada mes completo de los ultimos
 * `months` meses (desde que hay actividad) y hoy. Se reconstruye desde
 * los datos — ver src/lib/networth.ts.
 */
export async function getNetWorthHistory(
  householdId: string,
  display: Currency,
  months: number,
): Promise<NetWorthPoint[]> {
  const today = todayISO();
  const supabase = await createClient();

  const [accountsResult, txRows, holdings, loans] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, type, currency, initial_balance_minor")
      .eq("household_id", householdId)
      .eq("archived", false),
    fetchAll<{ account_id: string; amount_minor: string; occurred_on: string }>(
      (from, to) =>
        supabase
          .from("transactions")
          .select("account_id, amount_minor, occurred_on")
          .eq("household_id", householdId)
          .order("id")
          .range(from, to),
    ),
    getHoldings(householdId),
    getLoans(householdId),
  ]);
  if (accountsResult.error) throw accountsResult.error;

  const accounts = (
    (accountsResult.data ?? []) as {
      id: string;
      type: AccountType;
      currency: Currency;
      initial_balance_minor: string;
    }[]
  ).map((a) => ({
    id: a.id,
    type: a.type,
    currency: a.currency,
    initialMinor: BigInt(a.initial_balance_minor),
  }));
  const transactions: NwTransaction[] = txRows.map((tx) => ({
    accountId: tx.account_id,
    date: tx.occurred_on,
    amountMinor: BigInt(tx.amount_minor),
  }));
  const baseHoldings = holdings
    .filter((h) => !h.archived)
    .map((h) => ({
      id: h.id,
      currency: h.currency,
      assetCode: h.assetCode,
      spec: { method: h.method, currency: h.currency, terms: h.terms },
      flows: h.flows.map((f) => ({
        occurredOn: f.occurredOn,
        amountMinor: f.amountMinor,
        units: f.units,
      })),
      valuations: h.valuations.map((v) => ({
        valuedOn: v.valuedOn,
        valueMinor: v.valueMinor,
        unitPrice: v.unitPrice,
      })),
    }));
  const nwLoans: NwLoan[] = loans.map((l) => ({
    id: l.id,
    currency: l.currency,
    principalMinor: l.principalMinor,
    firstDueDate: l.firstDueDate,
    rows: l.rows,
    prepayments: l.prepayments,
  }));

  const start =
    earliestActivity({
      transactions,
      holdings: baseHoldings.map((h) => ({ ...h, priceAt: null })),
      loans: nwLoans,
    }) ?? today;
  const dates = seriesDates(start, today, months);
  const book = await loadRateBook(supabase, dates[0], today);

  // Los instrumentos por unidades se valorizan en cada fecha de la curva con la
  // cotizacion o el precio de ESA fecha.
  const rateAt = rateAtFromBook(book);
  const nwHoldings: NwHolding[] = baseHoldings.map((h) => ({
    id: h.id,
    currency: h.currency,
    spec: h.spec,
    flows: h.flows,
    valuations: h.valuations,
    priceAt: priceLookupFor(h.spec.method, h.assetCode, h.valuations, rateAt),
  }));

  return netWorthSeries({
    dates,
    display,
    book,
    accounts,
    transactions,
    holdings: nwHoldings,
    loans: nwLoans,
  });
}
