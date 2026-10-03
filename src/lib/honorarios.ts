/**
 * Boletas de honorarios (Chile): retencion segun el anio y calculo entre el
 * monto bruto de la boleta y lo que realmente se recibe. Logica pura, en CLP
 * enteros (sin decimales).
 *
 * La retencion sube de forma escalonada por la Ley 21.133 hasta llegar a 17%
 * en 2028. Se guarda en puntos base (1 pb = 0,01%) para no usar decimales
 * flotantes: 15,25% = 1525 pb. Es un anticipo de impuestos: en la Operacion
 * Renta se ajusta contra el impuesto real, asi que no es plata perdida.
 *
 * Es una ayuda para calcular, no asesoria tributaria: no considera gastos
 * presuntos, PPM ni los casos en que la boleta no lleva retencion.
 */

/** Retencion por anio, en puntos base. */
export const RETENTION_BPS_BY_YEAR: Record<number, number> = {
  2019: 1000,
  2020: 1075,
  2021: 1150,
  2022: 1225,
  2023: 1300,
  2024: 1375,
  2025: 1450,
  2026: 1525,
  2027: 1600,
  2028: 1700,
};

/** Primer y ultimo anio de la tabla; fuera de ella se usa el extremo mas cercano (desde 2028 queda en 17%). */
export const FIRST_YEAR = 2019;
export const LAST_YEAR = 2028;

const BPS = 10_000n;

export function retentionBps(year: number): number {
  const clamped = Math.min(LAST_YEAR, Math.max(FIRST_YEAR, Math.trunc(year)));
  return RETENTION_BPS_BY_YEAR[clamped];
}

/** "15,25%" */
export function formatRetention(year: number): string {
  const bps = retentionBps(year);
  return `${(bps / 100)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",")}%`;
}

export type HonorariosAmounts = {
  grossMinor: bigint;
  retentionMinor: bigint;
  netMinor: bigint;
};

/** Retencion de un monto bruto, redondeada al peso mas cercano (mitades hacia arriba). */
function retentionOf(grossMinor: bigint, bps: number): bigint {
  return (grossMinor * BigInt(bps) + BPS / 2n) / BPS;
}

/** Del monto bruto de la boleta a lo que se recibe. */
export function fromGross(grossMinor: bigint, year: number): HonorariosAmounts {
  const retentionMinor = retentionOf(grossMinor, retentionBps(year));
  return { grossMinor, retentionMinor, netMinor: grossMinor - retentionMinor };
}

/**
 * De lo que se quiere recibir al monto bruto que hay que poner en la boleta.
 * Si ningun bruto entrega exactamente ese liquido (por el redondeo), devuelve el
 * bruto mas bajo que entrega al menos ese monto.
 */
export function fromNet(netMinor: bigint, year: number): HonorariosAmounts {
  const bps = BigInt(retentionBps(year));
  // Aproximacion; luego se ajusta por el redondeo de la retencion.
  let gross = (netMinor * BPS + (BPS - bps) / 2n) / (BPS - bps);
  while (fromGross(gross, year).netMinor < netMinor) gross += 1n;
  while (gross > 0n && fromGross(gross - 1n, year).netMinor >= netMinor) gross -= 1n;
  return fromGross(gross, year);
}
