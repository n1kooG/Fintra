import { after } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { PrivacyProvider } from "@/components/privacy/privacy-provider";
import { CommandPalette } from "@/components/command-palette";
import { materializeDueRecurring } from "@/server/recurring/materialize";
import { syncRatesIfStale } from "@/server/fx/sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentHousehold();

  // El proxy ya redirige a /login sin sesion; esto es el resguardo por si
  // el layout se renderiza sin haber pasado por el proxy.
  if (!current) redirect("/login");

  const supabase = await createClient();

  // Al abrir la app se generan los recurrentes vencidos ANTES de pintar,
  // para que el sueldo de hoy ya aparezca en el saldo. Es una consulta
  // barata cuando no hay nada vencido; si falla, la app sigue igual (el
  // cron diario lo reintenta).
  try {
    await materializeDueRecurring(supabase, current.householdId);
  } catch {
    // Silencioso a proposito: no bloquear la app por esto.
  }

  // Las cotizaciones, en cambio, se refrescan DESPUES de responder: son
  // una llamada externa y no deben demorar la pantalla.
  after(async () => {
    try {
      await syncRatesIfStale();
    } catch {
      // Sin conexion a mindicador.cl: se reintenta en la proxima visita.
    }
  });

  return (
    <PrivacyProvider>
      <a
        href="#contenido"
        className="bg-background focus:border-border sr-only font-mono text-[11px] uppercase focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-dvh">
        <Sidebar
          displayName={current.displayName}
          householdName={current.householdName}
        />
        <main
          id="contenido"
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[70px] outline-none md:pb-0"
        >
          {children}
        </main>
        <BottomNav />
      </div>
      <CommandPalette />
    </PrivacyProvider>
  );
}
