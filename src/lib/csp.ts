/**
 * Content-Security-Policy con nonce por peticion (ver proxy.ts y la guia de
 * CSP de Next.js). Es pura para poder probarla.
 *
 * - script-src: solo scripts propios con el nonce de esta peticion;
 *   'strict-dynamic' deja que esos scripts carguen los que necesiten.
 *   Un script inyectado por un atacante no tiene el nonce y no corre.
 * - style-src lleva 'unsafe-inline': Radix, Recharts y Sonner posicionan
 *   elementos con atributos style="...", que un nonce no cubre. Los scripts
 *   son el vector que importa; el CSS inline no ejecuta codigo.
 * - SIN form-action: Chrome lo aplica tambien a las redirecciones, y el login
 *   con Google redirige desde un formulario a accounts.google.com.
 * - upgrade-insecure-requests solo en produccion (en http://localhost
 *   rompería los recursos).
 */
export function generateNonce(): string {
  // randomUUID() es criptograficamente aleatorio; base64 evita caracteres
  // que no son validos dentro de 'nonce-...'.
  return btoa(crypto.randomUUID());
}

export function buildCsp({
  nonce,
  isDev,
  supabaseUrl,
}: {
  nonce: string;
  isDev: boolean;
  supabaseUrl?: string;
}): string {
  const connect = ["'self'"];
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      connect.push(url.origin, `wss://${url.host}`);
    } catch {
      // URL mal configurada: se omite en vez de romper todas las paginas.
    }
  }
  if (isDev) connect.push("ws://localhost:*", "http://localhost:*");

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // lh3.googleusercontent.com: foto de perfil de Google.
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
