/**
 * Defensa extra contra CSRF para rutas POST con cookie de sesion: el
 * navegador siempre manda `Origin` en un POST entre sitios o desde un
 * formulario, y debe coincidir con el host que atiende la peticion. (Las
 * cookies de sesion ya son SameSite=Lax; esto es el segundo cerrojo.)
 */
export function isSameOrigin(headers: Pick<Headers, "get">): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
