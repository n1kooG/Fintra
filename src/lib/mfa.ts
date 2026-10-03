/**
 * Verificacion en dos pasos (TOTP) con Supabase Auth. Logica pura.
 *
 * Quien activa la verificacion queda con un "factor" verificado. Su sesion
 * parte en nivel de garantia aal1 (solo contrasena o Google) y sube a aal2
 * al escribir el codigo de la aplicacion de autenticacion. Mientras siga en
 * aal1, el proxy la manda a /verificar y la base de datos no le entrega
 * ningun dato (ver my_household_ids() en supabase/policies.sql): sin ese
 * segundo candado, alguien con la contrasena podria hablar directo con la
 * API de Supabase y saltarse la pantalla.
 */

type FactorLike = { status: string };

/** ¿Hay que pedir el segundo paso? Tiene un factor verificado y la sesion aun no esta en aal2. */
export function needsSecondFactor(
  factors: readonly FactorLike[] | null | undefined,
  currentLevel: string | null | undefined,
): boolean {
  const enrolled = (factors ?? []).some((factor) => factor.status === "verified");
  return enrolled && currentLevel !== "aal2" && currentLevel !== "aal3";
}

/** Codigo de 6 digitos (acepta espacios o guion, como lo muestran algunas apps: "123 456"). */
export function parseTotpCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}
