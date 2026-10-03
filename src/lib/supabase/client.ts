import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para Client Components. Usa las claves publicas
 * (seguras para el navegador): NEXT_PUBLIC_SUPABASE_URL y
 * NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
