import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getCategories } from "@/server/queries/categories";
import { getCategorizationRules } from "@/server/queries/categorization";
import { RulesManager } from "./rules-manager";

export default async function ReglasPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const [rules, categories] = await Promise.all([
    getCategorizationRules(current.householdId),
    getCategories(current.householdId),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-7 px-6 py-8 md:px-11">
      <div>
        <Link
          href="/configuracion"
          className="text-muted-foreground font-mono text-[10.5px] uppercase"
        >
          ‹ Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-medium md:text-[23px]">
          Reglas de auto-categorización
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md text-[14px]">
          Al escribir el comercio de un movimiento nuevo, la categoría se elige sola si
          coincide con una regla. Si varias coinciden, gana la más específica.
        </p>
      </div>
      <RulesManager rules={rules} categories={categories} />
    </div>
  );
}
