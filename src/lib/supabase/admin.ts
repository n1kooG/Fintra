import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la service role key: SALTA Row Level Security. Solo para
 * trabajo de sistema que no pertenece a un usuario — escribir el
 * catalogo compartido de cotizaciones y correr el cron diario sobre
 * todos los households. Nunca para leer o escribir datos a pedido de un
 * usuario (para eso esta src/lib/supabase/server.ts, que aplica RLS).
 *
 * Devuelve null si la key no esta configurada, para que quien llama
 * degrade con elegancia (por ejemplo, sin sincronizar) en vez de caerse.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
