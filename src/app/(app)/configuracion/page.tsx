import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getCategories } from "@/server/queries/categories";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { getLatestRates } from "@/server/queries/rates";
import { getCategorizationRules } from "@/server/queries/categorization";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { QUOTED_CURRENCIES } from "@/lib/mindicador";
import { formatShortDay } from "@/lib/dates";
import { getTags } from "@/server/tags";
import { getSharedSpace } from "@/server/households/queries";
import { SharedSpaceSection } from "./shared-space";
import { CategoriesManager } from "./categories-manager";
import { TagsManager } from "./tags-manager";
import { AppSection } from "./app-section";
import { SecuritySection } from "./security-section";
import { LegalLinks } from "@/components/legal-links";
import { DangerZone, ProfileSection } from "./profile-section";
import { RestoreDialog } from "./restore-dialog";
import { SyncRatesButton } from "./sync-rates-button";
import { ThemeSelect } from "./theme-select";

const RATE_LABEL = {
  USD: "Dólar observado",
  EUR: "Euro",
  UF: "UF",
  UTM: "UTM",
} as const;

/** "959.390000" -> "959,39" (cotizacion para leer, no para calcular). */
function formatRateForDisplay(rate: string) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(
    Number(rate),
  );
}

export default async function ConfiguracionPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [categories, rates, rules, membership, tags, space] = await Promise.all([
    getCategories(current.householdId),
    getLatestRates(),
    getCategorizationRules(current.householdId),
    supabase
      .from("household_members")
      .select("role")
      .eq("household_id", current.householdId)
      .eq("user_id", current.userId)
      .maybeSingle(),
    getTags(current.householdId),
    getSharedSpace(current.householdId, current.userId),
  ]);
  const email = user?.email ?? "";
  // Un factor verificado = la verificacion en dos pasos esta activa.
  const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
  const mfaEnabled = (mfaFactors?.totp.length ?? 0) > 0;
  const hasPassword = (user?.identities ?? []).some((i) => i.provider === "email");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-9 px-6 py-8 md:px-11">
      <h1 className="text-2xl font-medium md:text-[23px]">Configuración</h1>

      <ProfileSection
        displayName={current.displayName}
        email={email}
        householdName={current.householdName}
        isOwner={membership.data?.role === "owner"}
        hasPassword={hasPassword}
      />

      <SecuritySection enabled={mfaEnabled} />

      <SharedSpaceSection space={space} currentUserId={current.userId} />

      <div>
        <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
          Preferencias
        </div>
        <div className="border-border flex items-center justify-between border-b py-3">
          <span className="text-[14.5px]">Apariencia</span>
          <ThemeSelect />
        </div>
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3">
          <span className="text-[14.5px]">Moneda de visualización</span>
          <CurrencySwitcher value={current.displayCurrency} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
            Cotizaciones · mindicador.cl
          </span>
          <SyncRatesButton />
        </div>
        {QUOTED_CURRENCIES.map((currency) => {
          const rate = rates[currency];
          return (
            <div
              key={currency}
              className="border-border flex items-baseline justify-between border-b py-3"
            >
              <span className="text-[14.5px]">{RATE_LABEL[currency]}</span>
              <span className="text-muted-foreground font-mono text-[12px]">
                {rate
                  ? `$${formatRateForDisplay(rate.rate)} · ${formatShortDay(rate.date)}`
                  : "sin datos todavía"}
              </span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
          Automatización
        </div>
        <Link
          href="/configuracion/reglas"
          className="border-border flex items-baseline justify-between border-b py-3"
        >
          <span className="text-[14.5px]">Reglas de auto-categorización</span>
          <span className="text-muted-foreground font-mono text-[12px]">
            {rules.length} {rules.length === 1 ? "regla" : "reglas"} ›
          </span>
        </Link>
        <Link
          href="/recurrentes"
          className="border-border flex items-baseline justify-between border-b py-3"
        >
          <span className="text-[14.5px]">Movimientos recurrentes</span>
          <span className="text-muted-foreground font-mono text-[12px]">›</span>
        </Link>
      </div>

      <div>
        <div className="text-muted-foreground mb-4 font-mono text-[10px] tracking-[0.12em] uppercase">
          Categorías
        </div>
        <CategoriesManager categories={categories} />
      </div>

      <div>
        <div className="text-muted-foreground mb-4 font-mono text-[10px] tracking-[0.12em] uppercase">
          Etiquetas
        </div>
        <TagsManager tags={tags} />
      </div>

      <AppSection vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />

      <div>
        <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
          Datos
        </div>
        {/* <a> y no <Link>: son descargas, no navegaciones (Link las pre-cargaria). */}
        <a
          href="/api/export/respaldo"
          className="border-border flex items-baseline justify-between border-b py-3"
        >
          <span className="text-[14.5px]">Exportar respaldo (JSON)</span>
          <span className="text-muted-foreground font-mono text-[12px]">descargar ›</span>
        </a>
        <a
          href="/api/export/movimientos"
          className="border-border flex items-baseline justify-between border-b py-3"
        >
          <span className="text-[14.5px]">Exportar movimientos (CSV)</span>
          <span className="text-muted-foreground font-mono text-[12px]">descargar ›</span>
        </a>
        <a
          href="/api/export/movimientos?formato=xlsx"
          className="border-border flex items-baseline justify-between border-b py-3"
        >
          <span className="text-[14.5px]">Exportar movimientos (Excel)</span>
          <span className="text-muted-foreground font-mono text-[12px]">descargar ›</span>
        </a>
        <RestoreDialog />
        <p className="text-muted-foreground mt-2 font-mono text-[10.5px]">
          El CSV abre directo en Excel (columnas separadas por «;» y coma decimal); el
          .xlsx trae fechas y montos como datos reales, listos para filtrar y sumar. El
          respaldo trae todos tus datos sin cifrar: guárdalo en un lugar seguro.
        </p>
      </div>

      <DangerZone email={email} hasPassword={hasPassword} />

      <LegalLinks />

      <form action={signOut} className="pt-2">
        <button
          type="submit"
          className="text-destructive font-mono text-[11.5px] uppercase"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
