import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  smallint,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { accountTypeEnum, currencyEnum } from "./enums";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: currencyEnum("currency").notNull().default("CLP"),
    institution: text("institution"), // "BancoEstado", "BCI", "Falabella"...
    // Unidades minimas de la moneda (ver src/lib/money.ts) — nunca float.
    initialBalanceMinor: bigint("initial_balance_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    // Solo para tarjetas de credito (type = credit_card); null en el resto
    // y en tarjetas todavia sin configurar. Ver src/lib/cards.ts.
    creditLimitMinor: bigint("credit_limit_minor", { mode: "bigint" }),
    statementCloseDay: smallint("statement_close_day"),
    paymentDueDay: smallint("payment_due_day"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "accounts_close_day_range",
      sql`${t.statementCloseDay} is null or ${t.statementCloseDay} between 1 and 31`,
    ),
    check(
      "accounts_due_day_range",
      sql`${t.paymentDueDay} is null or ${t.paymentDueDay} between 1 and 31`,
    ),
    check(
      "accounts_credit_limit_nonnegative",
      sql`${t.creditLimitMinor} is null or ${t.creditLimitMinor} >= 0`,
    ),
  ],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  household: one(households, {
    fields: [accounts.householdId],
    references: [households.id],
  }),
}));
