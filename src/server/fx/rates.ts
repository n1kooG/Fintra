import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RateBook, formatRate, parseRate, type RateRow, type ScaledRate } from "@/lib/fx";
import { addDays } from "@/lib/recurrence";
import type { Currency } from "@/lib/money";
import type { QuotedCurrency } from "@/lib/mindicador";
import { todayISO } from "@/lib/dates";
import { backfillYear } from "./sync";

/**
 * Margen hacia atras al cargar cotizaciones para un rango: la UTM se
 * publica una vez al mes y el dolar no se publica fines de semana ni
 * feriados, asi que la cotizacion vigente el primer dia del rango puede
 * haberse publicado bastante antes.
 */
const LOOKBACK_DAYS = 45;
const PAGE_SIZE = 1000; // tope por respuesta de PostgREST

/**
 * Carga en memoria las cotizaciones necesarias para convertir montos
 * con fecha dentro de [from, to]. Pagina de a 1000 filas porque un
 * rango de varios anios supera el tope por respuesta de PostgREST.
 */
export async function loadRateBook(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<RateBook> {
  const rows: RateRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("date, currency, rate")
      .gte("date", addDays(from, -LOOKBACK_DAYS))
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      const rate = parseRate(row.rate);
      if (rate) rows.push({ date: row.date, currency: row.currency as Currency, rate });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return new RateBook(rows);
}

/**
 * Cuanto puede tener de antiguedad la cotizacion usada para congelar un
 * movimiento: mas que eso y es mejor no congelar nada (queda null y el
 * reporte la resuelve despues) que congelar un valor equivocado.
 */
const MAX_STALENESS_DAYS: Record<QuotedCurrency, number> = {
  USD: 7,
  EUR: 7,
  UF: 3,
  UTM: 40,
};

async function findRate(
  supabase: SupabaseClient,
  currency: QuotedCurrency,
  date: string,
): Promise<ScaledRate | null> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("currency", currency)
    .lte("date", date)
    .gte("date", addDays(date, -MAX_STALENESS_DAYS[currency]))
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return parseRate(data?.rate);
}

/**
 * Cotizacion a congelar en un movimiento en `currency` con fecha `date`,
 * como string listo para la columna numeric (null para CLP, o si no hay
 * cotizacion confiable). Si la base todavia no tiene esa fecha (un
 * gasto de hace meses cargado hoy), trae el anio completo desde
 * mindicador.cl y vuelve a buscar.
 */
export async function rateToFreeze(
  supabase: SupabaseClient,
  currency: Currency,
  date: string,
): Promise<string | null> {
  if (currency === "CLP") return null;

  const found = await findRate(supabase, currency, date);
  if (found) return formatRate(found);
  // Fecha futura: todavia no hay cotizacion publicada que traer.
  if (date > todayISO()) return null;

  const year = Number(date.slice(0, 4));
  await backfillYear(currency, year);
  // Enero puede necesitar la ultima cotizacion de diciembre del anio anterior.
  if (date.slice(5, 7) === "01") await backfillYear(currency, year - 1);

  const retried = await findRate(supabase, currency, date);
  return retried ? formatRate(retried) : null;
}
