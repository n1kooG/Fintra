import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Lee y escribe la sesion via cookies del request actual.
 *
 * En un Server Component (solo lectura) el `setAll` puede fallar si Next
 * ya envio la respuesta — se ignora a proposito: el proxy (proxy.ts) es quien
 * se encarga de refrescar la cookie de sesion en cada request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Se llamo desde un Server Component — el proxy refresca la sesion.
          }
        },
      },
    },
  );
}
