import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLatestRates } from "@/server/fx/sync";
import { materializeAllHouseholds } from "@/server/recurring/materialize";
import { notifyAllHouseholds } from "@/server/push/notify";
import { refreshCryptoPrices } from "@/server/prices/crypto";

/**
 * Tarea diaria (Vercel Cron, ver vercel.json): sincroniza cotizaciones
 * desde mindicador.cl, trae los precios de las criptomonedas que alguien
 * tenga como inversion y genera los movimientos recurrentes vencidos de
 * todos los households. Vercel manda `Authorization: Bearer
 * $CRON_SECRET`; sin ese secreto configurado la ruta queda cerrada.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 },
    );
  }

  const rates = await syncLatestRates();

  let crypto: Awaited<ReturnType<typeof refreshCryptoPrices>> | string;
  try {
    crypto = await refreshCryptoPrices(admin, null);
  } catch (error) {
    crypto = `error: ${(error as Error).message}`;
  }

  let recurring: number | string;
  try {
    recurring = await materializeAllHouseholds(admin);
  } catch (error) {
    recurring = `error: ${(error as Error).message}`;
  }

  let notifications: Awaited<ReturnType<typeof notifyAllHouseholds>> | string;
  try {
    notifications = await notifyAllHouseholds(admin);
  } catch (error) {
    notifications = `error: ${(error as Error).message}`;
  }

  return NextResponse.json({ rates, crypto, recurring, notifications });
}
