import { pgEnum } from "drizzle-orm/pg-core";

// Monedas soportadas. UF y UTM se modelan como moneda mas, no como caso
// especial — ver src/lib/fx.ts para la cotizacion diaria via mindicador.cl.
export const currencyEnum = pgEnum("currency", ["CLP", "USD", "UF", "UTM", "EUR"]);

export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "checking",
  "savings",
  "credit_card",
  "investment",
  "loan",
]);

export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

// Deudas entre personas: "lent" = le preste a alguien (me debe),
// "borrowed" = me prestaron (yo le debo).
export const debtDirectionEnum = pgEnum("debt_direction", ["lent", "borrowed"]);

// Tipos de instrumento de inversion (src/lib/investments.ts).
export const holdingKindEnum = pgEnum("holding_kind", [
  "fixed_term_deposit",
  "mutual_fund",
  "stock",
  "crypto",
  "foreign_currency",
  "other",
]);

export const householdRoleEnum = pgEnum("household_role", ["owner", "member"]);

// Frecuencias del motor de recurrentes (src/lib/recurrence.ts).
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
]);
