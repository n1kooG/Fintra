import type { NextConfig } from "next";

/**
 * Encabezados de seguridad estaticos para todas las rutas.
 *
 * El Content-Security-Policy NO va aqui: lleva un nonce distinto en cada
 * peticion y lo genera proxy.ts (ver src/lib/csp.ts).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Solo tiene efecto sobre HTTPS (en localhost el navegador lo ignora).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // El service worker debe poder actualizarse siempre y no heredar cache viejo.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
