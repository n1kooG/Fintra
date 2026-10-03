import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { QUOTED_CURRENCIES, type QuotedCurrency } from "@/lib/mindicador";

export type LatestRate = { currency: QuotedCurrency; date: string; rate: string } | null;

/** Ultima cotizacion guardada de USD, UF y UTM (en o antes de hoy), para Configuracion. */
export async function getLatestRates(): Promise<Record<QuotedCurrency, LatestRate>> {
  const supabase = await createClient();
  const today = todayISO();
  const results = await Promise.all(
    QUOTED_CURRENCIES.map(async (currency) => {
      const { data } = await supabase
        .from("exchange_rates")
        .select("date, rate")
        .eq("currency", currency)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [
        currency,
        data ? { currency, date: data.date, rate: data.rate } : null,
      ] as const;
    }),
  );
  return Object.fromEntries(results) as Record<QuotedCurrency, LatestRate>;
}
