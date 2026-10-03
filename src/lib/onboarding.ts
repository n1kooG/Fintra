/** Lo necesario para el asistente de primer uso (puro, para poder probarlo). */
import { normalizeName } from "./text";

export type AccountPreset = {
  id: string;
  label: string;
  /** Valor del enum `account_type`. */
  type: "checking" | "cash" | "savings" | "credit_card";
  defaultName: string;
  hint: string;
};

export const ACCOUNT_PRESETS: AccountPreset[] = [
  {
    id: "rut",
    label: "Cuenta RUT / vista",
    type: "checking",
    defaultName: "Cuenta RUT",
    hint: "La que usas todos los días",
  },
  {
    id: "checking",
    label: "Cuenta corriente",
    type: "checking",
    defaultName: "Cuenta corriente",
    hint: "Donde llega tu sueldo",
  },
  {
    id: "cash",
    label: "Efectivo",
    type: "cash",
    defaultName: "Efectivo",
    hint: "Billetera y monedas",
  },
  {
    id: "card",
    label: "Tarjeta de crédito",
    type: "credit_card",
    defaultName: "Tarjeta de crédito",
    hint: "Con su cierre, vencimiento y cupo",
  },
  {
    id: "savings",
    label: "Ahorro o inversión",
    type: "savings",
    defaultName: "Ahorro",
    hint: "Cuenta de ahorro o fondo",
  },
];

/** Categorias de gasto que suelen faltar en el set base. */
export const SUGGESTED_CATEGORIES: string[] = [
  "Suscripciones",
  "Educación",
  "Mascotas",
  "Ropa",
  "Regalos",
  "Hijos",
  "Seguros",
  "Gimnasio",
  "Viajes",
  "Auto y bencina",
  "Hogar",
  "Impuestos",
];

export { normalizeName };

/**
 * De los nombres elegidos, deja los que todavia no existen (sin distinguir
 * mayusculas ni tildes) y quita repetidos entre si.
 */
export function newCategoryNames(existing: string[], chosen: string[]): string[] {
  const seen = new Set(existing.map(normalizeName));
  const out: string[] = [];
  for (const raw of chosen) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
