import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { convertAtDate } from "@/lib/fx";
import {
  allocationByKind,
  percentOf,
  type AllocationRow,
  type HoldingKind,
} from "@/lib/investments";
import { buildHoldingView, type HoldingRow, type HoldingView } from "@/lib/holding-view";
import { todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { addDays } from "@/lib/recurrence";
import { loadRateBook } from "@/server/fx/rates";

export type { FlowView, HoldingView, Maturity, ValuationView } from "@/lib/holding-view";

const HOLDING_COLUMNS =
  "id, name, kind, currency, institution, notes, archived, valuation_method, asset_code, term_start, term_end, rate_percent, rate_period, created_at, flows:holding_flows(id, occurred_on, amount_minor, units, notes), valuations:holding_valuations(id, valued_on, value_minor, unit_price, source)";

/**
 * Instrumentos con sus aportes, valorizaciones y metricas, de mayor a menor
 * valor. Los que se valorizan solos (dolares, deposito a plazo, cripto...)
 * usan las cotizaciones y precios guardados; el libro de cotizaciones se carga
 * desde el primer aporte para poder calcular tambien la rentabilidad real.
 */
export async function getHoldings(
  householdId: string,
  client?: SupabaseClient,
): Promise<HoldingView[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("holdings")
    .select(HOLDING_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as HoldingRow[];
  const today = todayISO();

  let earliest = addDays(today, -35);
  for (const row of rows) {
    for (const flow of row.flows)
      if (flow.occurred_on < earliest) earliest = flow.occurred_on;
  }
  const book = await loadRateBook(supabase, earliest, today);

  return rows
    .map((row) => buildHoldingView(row, today, book))
    .sort((a, b) =>
      a.metrics.valueMinor < b.metrics.valueMinor
        ? 1
        : a.metrics.valueMinor > b.metrics.valueMinor
          ? -1
          : 0,
    );
}

export type Portfolio = {
  active: HoldingView[];
  archived: HoldingView[];
  /** Totales en la moneda de visualizacion, a la cotizacion de hoy (solo instrumentos activos). */
  totals: {
    valueMinor: bigint;
    investedMinor: bigint;
    gainMinor: bigint;
    returnPercent: number | null;
    /** Instrumentos que quedaron fuera por falta de cotizacion. */
    unconverted: number;
  };
  allocation: AllocationRow[];
};

export async function getPortfolio(
  householdId: string,
  display: Currency,
): Promise<Portfolio> {
  const today = todayISO();
  const supabase = await createClient();
  const [holdings, book] = await Promise.all([
    getHoldings(householdId),
    loadRateBook(supabase, today, today),
  ]);
  const active = holdings.filter((h) => !h.archived);
  const archived = holdings.filter((h) => h.archived);

  const toDisplay = (amountMinor: bigint, currency: Currency) =>
    convertAtDate(
      { amountMinor, currency, occurredOn: today, frozenRate: null },
      display,
      book,
    );

  let valueMinor = 0n;
  let investedMinor = 0n;
  let withdrawnMinor = 0n;
  let unconverted = 0;
  const allocationInput: { kind: HoldingKind; valueMinor: bigint }[] = [];

  for (const holding of active) {
    const value = toDisplay(holding.metrics.valueMinor, holding.currency);
    const invested = toDisplay(holding.metrics.investedMinor, holding.currency);
    const withdrawn = toDisplay(holding.metrics.withdrawnMinor, holding.currency);
    if (value === null || invested === null || withdrawn === null) {
      unconverted++;
      continue;
    }
    valueMinor += value;
    investedMinor += invested;
    withdrawnMinor += withdrawn;
    allocationInput.push({ kind: holding.kind, valueMinor: value });
  }

  const gainMinor = valueMinor + withdrawnMinor - investedMinor;
  return {
    active,
    archived,
    totals: {
      valueMinor,
      investedMinor,
      gainMinor,
      returnPercent: percentOf(gainMinor, investedMinor),
      unconverted,
    },
    allocation: allocationByKind(allocationInput),
  };
}
