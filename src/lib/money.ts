/**
 * Aritmetica y formateo de montos — nucleo critico del sistema.
 *
 * Regla de oro: los montos nunca son `number`/`float`. Siempre se
 * almacenan y operan como `bigint` en la unidad minima de su moneda
 * (ver `MINOR_UNITS`). Un monto de $10,50 USD se guarda como `1050n`;
 * un monto de $1.000 CLP se guarda como `1000n` (CLP no tiene
 * decimales). Esto elimina de raiz los errores de redondeo de punto
 * flotante en dinero.
 */

export const CURRENCIES = ["CLP", "USD", "EUR", "UF", "UTM"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Monedas en las que tiene sentido MOSTRAR totales consolidados. La UTM
 * queda fuera: sin decimales, cada unidad son ~$70.000 y un resumen del
 * mes en UTM seria puro redondeo. Se puede seguir teniendo cuentas y
 * movimientos en UTM; solo no se elige como moneda de visualizacion.
 */
export const DISPLAY_CURRENCIES = [
  "CLP",
  "USD",
  "EUR",
  "UF",
] as const satisfies readonly Currency[];

type CurrencyConfig = {
  /** Cantidad de decimales que representa 1 unidad de la moneda. */
  minorUnits: number;
  /** Simbolo a anteponer en formatMoney. */
  symbol: string;
};

export const CURRENCY_CONFIG: Record<Currency, CurrencyConfig> = {
  CLP: { minorUnits: 0, symbol: "$" },
  USD: { minorUnits: 2, symbol: "US$" },
  EUR: { minorUnits: 2, symbol: "€" },
  UF: { minorUnits: 2, symbol: "UF" },
  UTM: { minorUnits: 0, symbol: "UTM" },
};

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * Convierte un monto decimal ingresado por el usuario (ej. 38450, o
 * 10.5 para USD) a su representacion entera en unidades minimas.
 * Redondea al entero mas cercano en unidades minimas para evitar
 * arrastrar errores de coma flotante del input.
 */
export function toMinorUnits(amount: number, currency: Currency): bigint {
  const { minorUnits } = CURRENCY_CONFIG[currency];
  const scaled = Math.round(amount * Math.pow(10, minorUnits));
  return BigInt(scaled);
}

/** Convierte de unidades minimas a un numero decimal (para inputs/calculos puntuales). */
export function fromMinorUnits(amountMinor: bigint, currency: Currency): number {
  const { minorUnits } = CURRENCY_CONFIG[currency];
  return Number(amountMinor) / Math.pow(10, minorUnits);
}

type FormatOptions = {
  /** "auto" (default): signo solo si es negativo. "always": +/- siempre (regla de accesibilidad). "never": sin signo. */
  signDisplay?: "auto" | "always" | "never";
};

/**
 * Formatea un monto SIN simbolo de moneda, con separador de miles "."
 * y decimales con ",", como en el resto del sistema (filas de
 * movimientos, cifras monoespaciadas). Ej: formatAmount(-38450n, "CLP", { signDisplay: "always" }) -> "-38.450"
 *
 * Nota: usamos "-" (guion simple) aca; la capa de presentacion (Amount
 * component) es la que decide si renderiza el signo menos tipografico "−".
 */
export function formatAmount(
  amountMinor: bigint,
  currency: Currency,
  { signDisplay = "auto" }: FormatOptions = {},
): string {
  const { minorUnits } = CURRENCY_CONFIG[currency];
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;

  const divisor = pow10(minorUnits);
  const integerPart = abs / divisor;
  const fractionPart = abs % divisor;

  const integerStr = groupThousands(integerPart.toString());
  const body =
    minorUnits > 0
      ? `${integerStr},${fractionPart.toString().padStart(minorUnits, "0")}`
      : integerStr;

  // El cero no es ni entrada ni salida: nunca lleva signo, ni con "always".
  const isZero = amountMinor === 0n;
  const sign = negative ? "-" : signDisplay === "always" && !isZero ? "+" : "";
  return signDisplay === "never" ? body : `${sign}${body}`;
}

/** Formatea un monto CON simbolo de moneda. Ej: formatMoney(842350n, "CLP") -> "$842.350" */
export function formatMoney(
  amountMinor: bigint,
  currency: Currency,
  options: FormatOptions = {},
): string {
  const { symbol } = CURRENCY_CONFIG[currency];
  const amount = formatAmount(amountMinor, currency, options);
  // El signo va antes del simbolo ("-$1.000", no "$-1.000"), salvo que
  // no haya signo.
  const negative = amount.startsWith("-");
  const positive = amount.startsWith("+");
  if (negative || positive) {
    return `${amount[0]}${symbol}${amount.slice(1)}`;
  }
  return `${symbol}${amount}`;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Suma segura de montos en unidades minimas (misma moneda). */
export function sumAmounts(amounts: bigint[]): bigint {
  return amounts.reduce((total, a) => total + a, 0n);
}
