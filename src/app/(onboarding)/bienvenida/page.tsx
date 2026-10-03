import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccounts } from "@/server/queries/accounts";
import { getCategories } from "@/server/queries/categories";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const [accounts, categories] = await Promise.all([
    getAccounts(current.householdId),
    getCategories(current.householdId),
  ]);

  return (
    <OnboardingWizard
      firstName={current.displayName.split(" ")[0]}
      displayCurrency={current.displayCurrency}
      hasAccount={accounts.length > 0}
      existingCategories={categories
        .filter((c) => c.kind === "expense")
        .map((c) => c.name)}
    />
  );
}
