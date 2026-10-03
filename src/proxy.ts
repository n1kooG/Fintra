import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, generateNonce } from "@/lib/csp";

/**
 * OJO: con la carpeta `src/`, Next.js busca este archivo en `src/proxy.ts`
 * (al mismo nivel que `app`). En la raiz del proyecto se ignora sin avisar.
 */
export async function proxy(request: NextRequest) {
  // CSP con nonce por peticion. Next.js lee el nonce del CSP de la PETICION
  // para ponerlo en sus propios scripts, asi que va en los dos lados: en la
  // peticion (para que el render lo vea) y en la respuesta (para el navegador).
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas salvo assets estaticos, para poder
     * refrescar la sesion en cada navegacion.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
