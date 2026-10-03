/**
 * Que hace el proxy con cada peticion segun la ruta y si hay sesion. Pura,
 * para poder probarla: es la unica puerta de entrada de la app.
 */

// /api/cron no usa sesion de usuario: se protege con CRON_SECRET en la propia ruta.
// /manifest.webmanifest, /icons, /sw.js y /offline.html los pide el navegador sin sesion
// (instalar la PWA, registrar el service worker): no llevan datos de nadie.
// /privacidad y /terminos son paginas legales: deben poder leerse antes de registrarse.
export const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/recuperar",
  "/auth",
  "/api/cron",
  "/manifest.webmanifest",
  "/icons",
  "/sw.js",
  "/offline.html",
  "/privacidad",
  "/terminos",
];

/** Coincide con la ruta exacta o con una subruta ("/auth/callback"), no con prefijos de texto ("/login-x"). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Pantalla del segundo paso (solo para quien ya tiene sesion). No es publica. */
export const MFA_PATH = "/verificar";

export type AccessDecision =
  | "allow"
  | "redirect-to-login"
  | "unauthorized" // 401 JSON, para /api/* sin sesion (o sin el segundo paso)
  | "redirect-to-dashboard" // ya hay sesion y pide login/registro
  | "redirect-to-verify"; // hay sesion, pero falta el codigo de la verificacion en dos pasos

const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/");
const isMfaPath = (pathname: string) =>
  pathname === MFA_PATH || pathname.startsWith(`${MFA_PATH}/`);

/**
 * `needsMfa`: la persona tiene verificacion en dos pasos activada y su sesion aun
 * no la completo. Hasta entonces solo puede ver /verificar y lo publico.
 */
export function decideAccess(
  pathname: string,
  hasUser: boolean,
  needsMfa = false,
): AccessDecision {
  if (!hasUser && !isPublicPath(pathname)) {
    return isApi(pathname) ? "unauthorized" : "redirect-to-login";
  }
  if (hasUser && needsMfa) {
    if (isMfaPath(pathname)) return "allow";
    if (pathname === "/login" || pathname === "/registro") return "redirect-to-verify";
    if (isPublicPath(pathname)) return "allow";
    return isApi(pathname) ? "unauthorized" : "redirect-to-verify";
  }
  if (
    hasUser &&
    (pathname === "/login" || pathname === "/registro" || isMfaPath(pathname))
  ) {
    // /verificar sin nada que verificar tampoco tiene sentido: al inicio.
    return "redirect-to-dashboard";
  }
  return "allow";
}
