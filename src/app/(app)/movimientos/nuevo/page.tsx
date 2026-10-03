import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccounts } from "@/server/queries/accounts";
import { getCategories } from "@/server/queries/categories";
import { getCategorizationRules } from "@/server/queries/categorization";
import { getTags } from "@/server/tags";
import { getTransactionById } from "@/server/queries/transactions";
import { fromMinorUnits, type Currency } from "@/lib/money";
import { TransactionForm } from "./transaction-form";

export default async function NuevoMovimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicar?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");
  const { duplicar } = await searchParams;

  const [accounts, categories, rules, tags] = await Promise.all([
    getAccounts(current.householdId),
    getCategories(current.householdId),
    getCategorizationRules(current.householdId),
    getTags(current.householdId),
  ]);

  // «Duplicar»: el formulario parte con los datos de otro movimiento (de ingreso o gasto) y fecha de hoy.
  const source =
    duplicar && /^[0-9a-f-]{36}$/i.test(duplicar)
      ? await getTransactionById(current.householdId, duplicar)
      : null;
  const initial =
    source && source.type !== "transfer"
      ? {
          type: source.type as "income" | "expense",
          amount: Math.abs(
            fromMinorUnits(BigInt(source.amount_minor), source.currency as Currency),
          ),
          merchant: source.merchant,
          categoryId: source.category_id,
          accountId: source.account_id,
          tags: source.tags,
        }
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 py-10 md:justify-center md:py-16">
      <h1 className="mb-8 self-start text-xl font-medium md:self-center">
        {initial ? "Duplicar movimiento" : "Nuevo movimiento"}
      </h1>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        rules={rules}
        tagSuggestions={tags.map((t) => t.name)}
        initial={initial}
      />
    </div>
  );
}
