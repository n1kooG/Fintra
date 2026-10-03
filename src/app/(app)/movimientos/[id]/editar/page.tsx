import { notFound, redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccounts } from "@/server/queries/accounts";
import { getCategories } from "@/server/queries/categories";
import { getTransactionById } from "@/server/queries/transactions";
import { getTags } from "@/server/tags";
import { EditTransactionForm } from "./edit-transaction-form";

export default async function EditarMovimientoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const { id } = await params;
  const transaction = await getTransactionById(current.householdId, id);
  if (!transaction) notFound();

  if (transaction.type === "transfer") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-medium">Esta es una transferencia</h1>
        <p className="text-muted-foreground max-w-xs font-mono text-xs">
          Las transferencias no se editan: elimínala desde el listado y cárgala de nuevo
          con el monto correcto.
        </p>
      </div>
    );
  }

  const [accounts, categories, tags] = await Promise.all([
    getAccounts(current.householdId),
    getCategories(current.householdId),
    getTags(current.householdId),
  ]);

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 py-10 md:justify-center md:py-16">
      <h1 className="mb-8 self-start text-xl font-medium md:self-center">
        Editar movimiento
      </h1>
      <EditTransactionForm
        transaction={{ ...transaction, type: transaction.type as "income" | "expense" }}
        accounts={accounts}
        categories={categories}
        tagSuggestions={tags.map((t) => t.name)}
      />
    </div>
  );
}
