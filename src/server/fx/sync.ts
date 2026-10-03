import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatRate, type RateRow } from "@/lib/fx";
import {
  MINDICADOR_BASE_URL,
  MINDICADOR_CODES,
  QUOTED_CURRENCIES,
  parseMindicadorSeries,
  type QuotedCurrency,
} from "@/lib/mindicador";
import { addDays } from "@/lib/recurrence";
import { todayISO } from "@/lib/dates";

export type SyncResult = { saved: number; errors: string[] };

async function fetchSeries(currency: QuotedCurrency, year?: number): Promise<RateRow[]> {
  const path = year
    ? `${MINDICADOR_CODES[currency]}/${year}`
    : MINDICADOR_CODES[currency];
  const response = await fetch(`${MINDICADOR_BASE_URL}/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`mindicador.cl respondio ${response.status}`);
  return parseMindicadorSeries(await response.json(), currency);
}

async function saveRates(admin: SupabaseClient, rows: RateRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await admin.from("exchange_rates").upsert(
    rows.map((row) => ({
      date: row.date,
      currency: row.currency,
      rate: formatRate(row.rate),
      source: "mindicador.cl",
    })),
    { onConflict: "date,currency" },
  );
  if (error) throw new Error(error.message);
  return rows.length;
}

async function syncSeries(years: (number | undefined)[], currencies: QuotedCurrency[]) {
  const admin = createAdminClient();
  if (!admin) {
    return { saved: 0, errors: ["Falta SUPABASE_SERVICE_ROLE_KEY en el servidor."] };
  }

  const result: SyncResult = { saved: 0, errors: [] };
  const jobs = currencies.flatMap((currency) =>
    years.map((year) => ({ currency, year })),
  );
  await Promise.all(
    jobs.map(async ({ currency, year }) => {
      try {
        result.saved += await saveRates(admin, await fetchSeries(currency, year));
      } catch (error) {
        result.errors.push(`${currency}: ${(error as Error).message}`);
      }
    }),
  );
  return result;
}

/**
 * Trae las ultimas cotizaciones publicadas (mindicador devuelve ~30 dias
 * por serie, asi que si el cron se salto algun dia, la corrida siguiente
 * rellena el hueco sola) y las guarda. Idempotente: vuelve a escribir
 * el mismo valor si ya estaba.
 */
export function syncLatestRates(): Promise<SyncResult> {
  return syncSeries([undefined], QUOTED_CURRENCIES);
}

/** Trae el anio completo de una moneda — para congelar la cotizacion de un movimiento antiguo. */
export function backfillYear(
  currency: QuotedCurrency,
  year: number,
): Promise<SyncResult> {
  return syncSeries([year], [currency]);
}

/**
 * Sincroniza solo si hace falta: si falta la UF de hoy (se publica todos
 * los dias, incluso por adelantado) o el ultimo dolar tiene mas de 4
 * dias (cubre fin de semana largo). Pensado para correr con `after()`
 * al abrir la app, sin bloquear la respuesta — el cron diario es la via
 * principal en produccion.
 *
 * Usa el cliente admin tambien para leer (el catalogo de cotizaciones no
 * es dato de ningun usuario): dentro de `after()` ya no hay request con
 * cookies de sesion a las que recurrir.
 */
export async function syncRatesIfStale(): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const today = todayISO();
  const [{ data: ufToday }, { data: lastUsd }] = await Promise.all([
    admin
      .from("exchange_rates")
      .select("date")
      .eq("currency", "UF")
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("exchange_rates")
      .select("date")
      .eq("currency", "USD")
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const usdFresh = lastUsd && lastUsd.date >= addDays(today, -4);
  if (ufToday && usdFresh) return;

  await syncLatestRates();
}
