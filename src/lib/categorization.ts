/**
 * Reglas de auto-categorizacion por texto del comercio ("si contiene
 * UBER -> Transporte"). Logica pura: la usa el formulario de alta al
 * vuelo (mientras se escribe el comercio) y el servidor al aplicar las
 * reglas en lote sobre el historial — ambos con el mismo criterio.
 */

import type { CategoryKind } from "./supabase/types";

export type CategorizationRule = {
  id: string;
  pattern: string;
  categoryId: string;
  /** Tipo de la categoria destino: una regla de gasto nunca categoriza un ingreso. */
  kind: CategoryKind;
};

/**
 * Normaliza para comparar: minusculas, sin tildes ni dieresis, espacios
 * colapsados. "Café  Ñuñoa" y "cafe ñuñoa" coinciden (la ñ se conserva:
 * es una letra, no una tilde).
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(?!̃)[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devuelve la regla que aplica a un comercio, o null. Si varias
 * coinciden gana el patron mas largo (el mas especifico): con "uber" ->
 * Transporte y "uber eats" -> Restaurantes, "UBER EATS SANTIAGO" va a
 * Restaurantes.
 */
export function matchRule<R extends CategorizationRule>(
  merchant: string | null | undefined,
  kind: CategoryKind,
  rules: R[],
): R | null {
  if (!merchant) return null;
  const haystack = normalizeText(merchant);
  if (!haystack) return null;

  let best: R | null = null;
  let bestLength = 0;
  for (const rule of rules) {
    if (rule.kind !== kind) continue;
    const needle = normalizeText(rule.pattern);
    if (needle.length > bestLength && haystack.includes(needle)) {
      best = rule;
      bestLength = needle.length;
    }
  }
  return best;
}
