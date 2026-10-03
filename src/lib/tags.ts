/**
 * Etiquetas transversales de movimientos ("viaje Bariloche", "regalos").
 * Logica pura: limpiar lo que escribe la persona y evitar duplicados que solo
 * difieren en mayusculas o tildes.
 */
import { normalizeName } from "./text";

export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_PER_TRANSACTION = 10;

/** Quita el "#" inicial, compacta espacios y corta al maximo. Devuelve "" si no queda nada. */
export function cleanTagName(raw: string): string {
  return raw
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** Clave de comparacion: "Viaje" y "viáje" son la misma etiqueta. */
export function tagKey(name: string): string {
  return normalizeName(cleanTagName(name));
}

/**
 * Lee etiquetas de un texto separado por comas, punto y coma o saltos de
 * linea (o de una lista). Limpia cada una, descarta vacias y repetidas, y
 * corta al maximo por movimiento. Conserva el primer escrito de cada una.
 */
export function parseTagNames(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,;\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const name = cleanTagName(part);
    if (!name) continue;
    const key = tagKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_TAGS_PER_TRANSACTION) break;
  }
  return out;
}
