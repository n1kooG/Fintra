import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { fetchAll } from "@/server/queries/paginate";
import { BACKUP_APP, BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup";

/**
 * Respaldo completo en JSON de todos los datos del household: cada tabla
 * tal como esta en la base (los montos son strings de unidades minimas,
 * sin perdida de precision). No incluye datos de autenticacion ni el
 * catalogo compartido de cotizaciones. Requiere sesion.
 */
export async function GET() {
  const current = await getCurrentHousehold();
  if (!current) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = await createClient();
  const entries = await Promise.all(
    BACKUP_TABLES.map(async ({ table, hasHousehold }) => {
      if (hasHousehold === false) {
        // transaction_tags no tiene household_id: se filtra por el
        // hogar de su movimiento y se quita el embebido del resultado.
        const links = await fetchAll<{
          transaction_id: string;
          tag_id: string;
        }>((from, to) =>
          supabase
            .from("transaction_tags")
            .select("transaction_id, tag_id, transactions!inner(household_id)")
            .eq("transactions.household_id", current.householdId)
            .order("transaction_id")
            .order("tag_id")
            .range(from, to),
        );
        return [
          table,
          links.map(({ transaction_id, tag_id }) => ({ transaction_id, tag_id })),
        ] as const;
      }
      const rows = await fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from(table)
          .select("*")
          .eq("household_id", current.householdId)
          .order("id")
          .range(from, to),
      );
      return [table, rows] as const;
    }),
  );

  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    household: { id: current.householdId, name: current.householdName },
    profile: {
      displayName: current.displayName,
      displayCurrency: current.displayCurrency,
    },
    data: Object.fromEntries(entries),
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fintra-respaldo-${todayISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
