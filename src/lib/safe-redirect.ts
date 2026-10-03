/**
 * Valida el destino `next` que viaja en la URL tras iniciar sesion. Solo se
 * aceptan rutas internas ("/algo?x=1"); cualquier otra cosa (URL absoluta,
 * "//otro.sitio", "/\otro.sitio", "@otro.sitio", caracteres de control que
 * el navegador descarta antes de interpretar la ruta) cae en `fallback`.
 * Sin esto, un enlace de phishing podria mandar a la persona a otro sitio
 * justo despues de que escriba su contrasena en el real.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard") {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;

  try {
    const url = new URL(raw, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
