import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  compareBreakdowns,
  unusualExpenses,
  type UnusualExpense,
  type UnusualInput,
  monthBreakdown,
  monthKeysEndingAt,
  monthlyTotals,
  type ComparedCategory,
  type MonthTotals,
} from "@/lib/analytics";
import { monthBounds, shiftMonth } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { loadRateBook } from "@/server/fx/rates";
import { fetchAll } from "./paginate";
import { getCategoryLabelMap } from "./categories";
import { withCategoryLabels } from "@/lib/categories";

export type ReportData = {
  monthKey: string;
  /** Los meses de la evolucion, del mas antiguo al seleccionado. */
  monthly: MonthTotals[];
  current: MonthTotals;
  previous: MonthTotals;
  /** El mismo mes del anio anterior (en cero si no hay datos de entonces). */
  yearAgo: MonthTotals;
  /** Gastos del mes que se salen de lo habitual en su categoria. */
  unusual: UnusualExpense[];
  /** Gasto por categoria del mes contra el anterior. */
  categories: ComparedCategory[];
  unconverted: number;
};

/**
 * Todo lo que muestra la pantalla de Reportes para un mes: evolucion de
 * los ultimos `evolutionMonths` meses (terminando en el elegido), totales
 * del mes contra el anterior y gasto por categoria con su variacion.
 * Una sola lectura de movimientos (paginada) y una de cotizaciones.
 */
export async function getReportData(
  householdId: string,
  monthKey: string,
  display: Currency,
  evolutionMonths: number,
): Promise<ReportData> {
  const supabase = await createClient();
  const monthKeys = monthKeysEndingAt(monthKey, Math.max(2, evolutionMonths));
  const yearAgoKey = shiftMonth(monthKey, -12);
  const evolutionFrom = monthBounds(monthKeys[0]).from;
  const yearAgoFrom = monthBounds(yearAgoKey).from;
  const from = yearAgoFrom < evolutionFrom ? yearAgoFrom : evolutionFrom;
  const to = monthBounds(monthKey).to;

  const [rawRows, book, labels] = await Promise.all([
    fetchAll<UnusualInput>((start, end) =>
      supabase
        .from("transactions")
        .select(
          "id, merchant, type, amount_minor, currency, fx_rate, occurred_on, category_id, category:categories(id, name)",
        )
        .eq("household_id", householdId)
        .in("type", ["income", "expense"])
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("id")
        .range(start, end),
    ),
    loadRateBook(supabase, from, to),
    getCategoryLabelMap(householdId),
  ]);
  const rows = withCategoryLabels(rawRows, labels);

  const monthly = monthlyTotals(rows, monthKeys, display, book);
  const current = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];
  const currentBreakdown = monthBreakdown(rows, current.monthKey, display, book);
  const previousBreakdown = monthBreakdown(rows, previous.monthKey, display, book);

  return {
    monthKey,
    monthly,
    current,
    previous,
    yearAgo: monthlyTotals(rows, [yearAgoKey], display, book)[0],
    unusual: unusualExpenses({ transactions: rows, monthKey, display, book }),
    categories: compareBreakdowns(currentBreakdown.rows, previousBreakdown.rows),
    unconverted: current.unconverted,
  };
}
