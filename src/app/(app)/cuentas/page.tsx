import Link from "next/link";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getAccountsOverview, type AccountWithBalance } from "@/server/queries/accounts";
import { Amount } from "@/components/money/amount";
import { CurrencySwitcher } from "@/components/money/currency-switcher";
import { UnconvertedNotice } from "@/components/money/unconverted-notice";
import type { Currency } from "@/lib/money";
import { AccountFormDialog } from "./account-form-dialog";
import { ArchiveAccountButton } from "./archive-account-button";
import { ReconcileDialog } from "./reconcile-dialog";
import { redirect } from "next/navigation";

const TYPE_LABEL: Record<AccountWithBalance["type"], string> = {
  cash: "Efectivo",
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  loan: "Préstamo",
};

function groupAccounts(accounts: AccountWithBalance[]) {
  const cuentas = accounts.filter((a) =>
    ["cash", "checking", "savings"].includes(a.type),
  );
  const tarjetas = accounts.filter((a) => a.type === "credit_card");
  const inversion = accounts.filter((a) => ["investment", "loan"].includes(a.type));
  return { cuentas, tarjetas, inversion };
}

export default async function CuentasPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const display = current.displayCurrency;
  const { accounts, netWorth } = await getAccountsOverview(current.householdId, display);
  const { cuentas, tarjetas, inversion } = groupAccounts(accounts);
  const groupProps = { display, converted: netWorth.convertedById };

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-7 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Cuentas</h1>
        <div className="flex items-center gap-5">
          <CurrencySwitcher value={display} />
          <AccountFormDialog />
        </div>
      </div>

      <div className="border-border flex border-t border-b">
        <div className="border-border flex-1 border-r py-4 pr-5 first:pl-0">
          <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
            Activos ({display})
          </div>
          <Amount
            amountMinor={netWorth.assetsMinor}
            currency={display}
            withSymbol
            tone="income"
            signDisplay="always"
            className="mt-1.5 text-xl"
          />
        </div>
        <div className="border-border flex-1 border-r py-4 pl-5">
          <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
            Pasivos ({display})
          </div>
          <Amount
            amountMinor={netWorth.liabilitiesMinor}
            currency={display}
            withSymbol
            tone="expense"
            signDisplay="always"
            className="mt-1.5 text-xl"
          />
        </div>
        <div className="flex-1 py-4 pl-5">
          <div className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
            Patrimonio neto
          </div>
          <Amount
            amountMinor={netWorth.netWorthMinor}
            currency={display}
            withSymbol
            tone={netWorth.netWorthMinor < 0n ? "expense" : "neutral"}
            className="mt-1.5 text-xl font-semibold"
          />
        </div>
      </div>
      <UnconvertedNotice count={netWorth.unconverted} />
      <p className="text-muted-foreground -mt-3 font-mono text-[10px]">
        Los activos incluyen el valor de tus{" "}
        <Link href="/inversiones" className="border-muted-foreground border-b">
          inversiones
        </Link>{" "}
        y los pasivos, el capital pendiente de los préstamos registrados en{" "}
        <Link href="/tarjetas" className="border-muted-foreground border-b">
          Tarjetas y deudas
        </Link>
        .
      </p>

      {accounts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-muted-foreground text-[15px] italic">
            Todavía no agregaste ninguna cuenta
          </p>
        </div>
      ) : (
        <>
          <AccountGroup title="Cuentas" accounts={cuentas} {...groupProps} />
          <AccountGroup title="Tarjetas de crédito" accounts={tarjetas} {...groupProps} />
          <AccountGroup title="Ahorro e inversión" accounts={inversion} {...groupProps} />
        </>
      )}
    </div>
  );
}

function AccountGroup({
  title,
  accounts,
  display,
  converted,
}: {
  title: string;
  accounts: AccountWithBalance[];
  display: Currency;
  converted: Map<string, bigint | null>;
}) {
  if (accounts.length === 0) return null;

  return (
    <div>
      <div className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="border-border group flex flex-col gap-3 border-t px-0 py-4 pr-6 md:border-t-0 md:border-r md:px-5 md:first:pl-0"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] italic">{account.name}</span>
              <span className="flex gap-3">
                <ReconcileDialog
                  accountId={account.id}
                  name={account.name}
                  currency={account.currency}
                  balanceMinor={account.balanceMinor}
                />
                <ArchiveAccountButton accountId={account.id} />
              </span>
            </div>
            <div className="text-muted-foreground font-mono text-[9.5px] tracking-[0.06em] uppercase">
              {account.institution ?? TYPE_LABEL[account.type]} · {account.currency}
            </div>
            <Amount
              amountMinor={account.balanceMinor}
              currency={account.currency}
              tone={account.balanceMinor < 0n ? "expense" : "neutral"}
              className="text-xl"
            />
            {account.currency !== display && converted.get(account.id) != null ? (
              <span className="text-muted-foreground -mt-2 font-mono text-[10.5px]">
                ≈{" "}
                <Amount
                  amountMinor={converted.get(account.id)!}
                  currency={display}
                  withSymbol
                  tone="neutral"
                />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
