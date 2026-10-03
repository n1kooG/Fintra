import "server-only";

/**
 * PostgREST (Supabase) corta cada respuesta en 1.000 filas. Cuando se
 * necesita TODO lo que coincide (por ejemplo, todos los movimientos para
 * sumar un saldo), un `select` simple devolveria solo las primeras 1.000
 * sin avisar y el total saldria mal. Esto pide de a paginas hasta agotar
 * las filas. `page` debe incluir un orden estable (`.order("id")`) para
 * que las paginas no se pisen.
 */
const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
