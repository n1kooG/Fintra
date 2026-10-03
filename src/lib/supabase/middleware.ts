import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MFA_PATH, decideAccess } from "@/lib/access";
import { needsSecondFactor } from "@/lib/mfa";

/**
 * Redirige conservando las cookies de sesion que Supabase haya renovado en
 * esta misma peticion. Si se devolviera un redirect "limpio", el token nuevo
 * (y la rotacion del refresh token) se perderia y la sesion podria cerrarse.
 */
function redirectKeepingSession(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

/**
 * Refresca la sesion de Supabase en cada request y redirige a /login si
 * falta sesion en una ruta protegida. Se invoca desde proxy.ts (el
 * antiguo middleware.ts, renombrado en Next.js 16).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no ejecutar logica entre createServerClient y getUser().
  // Un error simple ahi puede hacer muy dificil debuggear sesiones que
  // se cierran solas de forma intermitente.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Segundo paso: los factores salen de la respuesta de getUser() (fresca, de la red); el nivel
  // de la sesion, del JWT. Se mira solo con sesion, y la lectura del nivel es local (sin red).
  let needsMfa = false;
  if (user) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa = needsSecondFactor(user.factors, assurance?.currentLevel);
  }

  const decision = decideAccess(pathname, Boolean(user), needsMfa);

  if (decision === "unauthorized") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (decision === "redirect-to-login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirectKeepingSession(url, supabaseResponse);
  }

  if (decision === "redirect-to-verify") {
    const url = request.nextUrl.clone();
    url.pathname = MFA_PATH;
    url.search = "";
    // Si venia de /login, no hay destino que conservar; si venia de otra pagina, vuelve a ella.
    if (pathname !== "/login" && pathname !== "/registro") {
      url.searchParams.set("next", pathname);
    }
    return redirectKeepingSession(url, supabaseResponse);
  }

  if (decision === "redirect-to-dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectKeepingSession(url, supabaseResponse);
  }

  return supabaseResponse;
}
