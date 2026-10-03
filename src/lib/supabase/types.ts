import type { Currency } from "@/lib/money";
import type { Frequency } from "@/lib/recurrence";
import type { HoldingKind } from "@/lib/investments";

/**
 * Tipos de las filas tal como las devuelve el cliente de Supabase
 * (supabase-js/PostgREST): nombres de columna en snake_case, y las
 * columnas `bigint` llegan como STRING (PostgREST las serializa asi
 * para no perder precision) — conviene pasar por `BigInt(...)` antes
 * de usarlas con src/lib/money.ts.
 *
 * Distintos de los tipos que infiere Drizzle en src/db/schema (esos
 * son camelCase y son para el query builder de Drizzle, que en este
 * proyecto se usa solo para el esquema y las migraciones — toda
 * lectura/escritura en tiempo real pasa por supabase-js para que Row
 * Level Security se aplique con el JWT del usuario).
 */

export type AccountType =
  "cash" | "checking" | "savings" | "credit_card" | "investment" | "loan";

export type CategoryKind = "income" | "expense";
export type TransactionType = "income" | "expense" | "transfer";

export type AccountRow = {
  id: string;
  household_id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  institution: string | null;
  initial_balance_minor: string;
  /** Solo tarjetas de credito (src/lib/cards.ts); null si no aplica o falta configurar. */
  credit_limit_minor: string | null;
  statement_close_day: number | null;
  payment_due_day: number | null;
  archived: boolean;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  household_id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount_minor: string;
  currency: Currency;
  fx_rate: string | null;
  occurred_on: string;
  merchant: string | null;
  notes: string | null;
  recurring_rule_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TransferRow = {
  id: string;
  household_id: string;
  from_transaction_id: string;
  to_transaction_id: string;
  created_at: string;
};

export type RecurringRuleRow = {
  id: string;
  household_id: string;
  type: "income" | "expense";
  account_id: string;
  category_id: string | null;
  /** Magnitud positiva; el signo lo decide `type`. */
  amount_minor: string;
  currency: Currency;
  merchant: string | null;
  notes: string | null;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  next_run_on: string;
  active: boolean;
  created_by: string;
  created_at: string;
};

export type CategorizationRuleRow = {
  id: string;
  household_id: string;
  pattern: string;
  category_id: string;
  created_at: string;
};

export type ExchangeRateRow = {
  id: string;
  date: string;
  currency: Currency;
  /** numeric(18,6) llega como string — pasar por parseRate (src/lib/fx.ts). */
  rate: string;
  source: string;
  created_at: string;
};

export type BudgetRow = {
  id: string;
  household_id: string;
  category_id: string;
  /** Primer dia del mes, "yyyy-mm-01". */
  month: string;
  amount_minor: string;
  currency: Currency;
  created_at: string;
};

export type GoalRow = {
  id: string;
  household_id: string;
  name: string;
  target_minor: string;
  currency: Currency;
  target_date: string | null;
  created_at: string;
};

export type GoalContributionRow = {
  id: string;
  household_id: string;
  goal_id: string;
  amount_minor: string;
  occurred_on: string;
  notes: string | null;
  created_at: string;
};

export type InstallmentPlanRow = {
  id: string;
  household_id: string;
  account_id: string;
  transaction_id: string;
  installments_count: number;
  total_minor: string;
  first_due_date: string;
  due_day: number;
  created_at: string;
};

export type LoanRow = {
  id: string;
  household_id: string;
  name: string;
  lender: string | null;
  principal_minor: string;
  currency: Currency;
  installments_count: number;
  installment_minor: string;
  first_due_date: string;
  created_at: string;
};

export type DebtDirection = "lent" | "borrowed";

export type PersonalDebtRow = {
  id: string;
  household_id: string;
  person: string;
  direction: DebtDirection;
  amount_minor: string;
  currency: Currency;
  occurred_on: string;
  notes: string | null;
  settled_on: string | null;
  created_at: string;
};

export type HoldingRow = {
  id: string;
  household_id: string;
  name: string;
  kind: HoldingKind;
  currency: Currency;
  institution: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
};

export type HoldingFlowRow = {
  id: string;
  household_id: string;
  holding_id: string;
  occurred_on: string;
  /** Aporte (+) o retiro (-). */
  amount_minor: string;
  notes: string | null;
  created_at: string;
};

export type HoldingValuationRow = {
  id: string;
  household_id: string;
  holding_id: string;
  valued_on: string;
  value_minor: string;
  created_at: string;
};
