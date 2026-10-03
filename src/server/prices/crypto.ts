import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COINGECKO_BASE_URL,
  cryptoAsset,
  parseCoinGeckoPrices,
  type CryptoVsCurrency,
} from "@/lib/crypto";
import { parseUnits, priceToDb, unitsValueMinor } from "@/lib/holding-value";
import { todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";

export type CryptoRefreshResult = { updated: number; error: string | null };

async function fetchPrices(ids: string[], vs: CryptoVsCurrency) {
  const url = new URL(`${COINGECKO_BASE_URL}/simple/price`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", vs.toLowerCase());
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`CoinGecko respondio ${response.status}`);
  return parseCoinGeckoPrices(await response.json(), vs);
}

type CryptoHolding = {
  id: string;
  household_id: string;
  currency: Currency;
  asset_code: string | null;
  flows: { occurred_on: string; units: string | null }[];
};

/**
 * Guarda el precio de hoy de cada criptomoneda que algun instrumento activo
 * tenga, como un punto de precio (una fila por instrumento y dia: guardar de
 * nuevo reemplaza el valor, asi que se puede refrescar varias veces al dia).
 * Corre en el cron diario con el cliente admin (sin sesion, `householdId`
 * null = todos) y bajo demanda al abrir Inversiones (acotado al hogar).
 * Si CoinGecko no responde conserva el ultimo precio: nunca borra nada.
 */
export async function refreshCryptoPrices(
  client: SupabaseClient,
  householdId: string | null,
): Promise<CryptoRefreshResult> {
  let query = client
    .from("holdings")
    .select(
      "id, household_id, currency, asset_code, flows:holding_flows(occurred_on, units)",
    )
    .eq("valuation_method", "crypto")
    .eq("archived", false);
  if (householdId) query = query.eq("household_id", householdId);

  const { data, error } = await query;
  if (error) return { updated: 0, error: error.message };
  const holdings = (data ?? []) as unknown as CryptoHolding[];
  if (holdings.length === 0) return { updated: 0, error: null };

  const today = todayISO();
  let updated = 0;
  const errors: string[] = [];

  // Una consulta por moneda de medicion (CLP / USD) con todos los activos que se usan.
  for (const vs of ["CLP", "USD"] as const) {
    const group = holdings.filter((h) => h.currency === vs);
    const ids = [
      ...new Set(
        group.flatMap((h) => {
          const asset = cryptoAsset(h.asset_code);
          return asset ? [asset.id] : [];
        }),
      ),
    ];
    if (ids.length === 0) continue;

    let prices: Map<string, bigint>;
    try {
      prices = await fetchPrices(ids, vs);
    } catch (e) {
      errors.push(`${vs}: ${(e as Error).message}`);
      continue;
    }

    const rows = group.flatMap((h) => {
      const asset = cryptoAsset(h.asset_code);
      const price = asset ? prices.get(asset.id) : undefined;
      if (!asset || !price) return [];
      const units = h.flows
        .filter((f) => f.occurred_on <= today)
        .reduce((sum, f) => sum + (parseUnits(f.units) ?? 0n), 0n);
      return [
        {
          household_id: h.household_id,
          holding_id: h.id,
          valued_on: today,
          value_minor: unitsValueMinor(
            units > 0n ? units : 0n,
            price,
            h.currency,
          ).toString(),
          unit_price: priceToDb(price),
          source: "coingecko",
          created_at: new Date().toISOString(),
        },
      ];
    });
    if (rows.length === 0) continue;

    const { error: upsertError } = await client
      .from("holding_valuations")
      .upsert(rows, { onConflict: "holding_id,valued_on" });
    if (upsertError) errors.push(`${vs}: ${upsertError.message}`);
    else updated += rows.length;
  }

  return { updated, error: errors.length > 0 ? errors.join(" · ") : null };
}

/** ¿Hay instrumentos cripto sin precio de hace menos de `maxAgeMinutes`? */
export function cryptoPricesStale(
  holdings: {
    method: string;
    archived: boolean;
    valuations: { valuedOn: string; source: string }[];
  }[],
  today: string,
): boolean {
  return holdings.some(
    (h) =>
      h.method === "crypto" &&
      !h.archived &&
      !h.valuations.some((v) => v.valuedOn === today && v.source === "coingecko"),
  );
}
