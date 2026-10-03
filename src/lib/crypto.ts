/**
 * Criptomonedas soportadas para valorizacion automatica y lectura de la API
 * publica de CoinGecko (sin llave). Solo parseo puro: la llamada de red y el
 * guardado viven en src/server/prices/crypto.ts.
 *
 * GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=clp,usd
 *   -> { "bitcoin": { "clp": 95000000, "usd": 100000 }, ... }
 */

import { parsePrice } from "./holding-value";

export const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export type CryptoAsset = { code: string; id: string; name: string };

/** Las monedas mas usadas por personas en Chile. `id` es el identificador de CoinGecko. */
export const CRYPTO_ASSETS: CryptoAsset[] = [
  { code: "BTC", id: "bitcoin", name: "Bitcoin" },
  { code: "ETH", id: "ethereum", name: "Ethereum" },
  { code: "USDT", id: "tether", name: "Tether" },
  { code: "USDC", id: "usd-coin", name: "USD Coin" },
  { code: "SOL", id: "solana", name: "Solana" },
  { code: "BNB", id: "binancecoin", name: "BNB" },
  { code: "XRP", id: "ripple", name: "XRP" },
  { code: "ADA", id: "cardano", name: "Cardano" },
  { code: "DOGE", id: "dogecoin", name: "Dogecoin" },
  { code: "LTC", id: "litecoin", name: "Litecoin" },
];

export function cryptoAsset(code: string | null | undefined): CryptoAsset | null {
  return CRYPTO_ASSETS.find((a) => a.code === code) ?? null;
}

/** Monedas en que se puede medir un instrumento cripto (CoinGecko las publica todas). */
export const CRYPTO_VS_CURRENCIES = ["CLP", "USD"] as const;
export type CryptoVsCurrency = (typeof CRYPTO_VS_CURRENCIES)[number];

/**
 * Lee la respuesta de /simple/price y devuelve, por id, el precio escalado
 * (6 decimales) en `vs`. Ignora en silencio lo malformado (precio ausente,
 * cero o negativo, no numerico) en vez de fallar la actualizacion completa.
 */
export function parseCoinGeckoPrices(
  payload: unknown,
  vs: CryptoVsCurrency,
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (typeof payload !== "object" || payload === null) return out;
  const key = vs.toLowerCase();
  for (const [id, quote] of Object.entries(payload as Record<string, unknown>)) {
    const value = (quote as Record<string, unknown> | null)?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    // toFixed evita la notacion cientifica de los numeros muy pequenos.
    const price = parsePrice(value.toFixed(6));
    if (price && price > 0n) out.set(id, price);
  }
  return out;
}
