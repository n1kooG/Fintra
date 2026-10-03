import {
  pgTable,
  uuid,
  text,
  bigint,
  numeric,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { recurringRules } from "./recurring";
import { currencyEnum, transactionTypeEnum } from "./enums";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    type: transactionTypeEnum("type").notNull(),
    // Siempre entero en unidades minimas de `currency` — nunca float.
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    // Cotizacion congelada a la fecha del movimiento (ver src/lib/fx.ts).
    // Null cuando currency == moneda base del household (sin conversion).
    fxRate: numeric("fx_rate", { precision: 18, scale: 6 }),
    occurredOn: date("occurred_on").notNull(),
    merchant: text("merchant"),
    notes: text("notes"),
    // Regla recurrente que genero este movimiento (null si se cargo a mano).
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_household_date_idx").on(t.householdId, t.occurredOn),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
    // Una regla genera a lo sumo un movimiento por fecha: si el cron y la
    // generacion al abrir la app corren a la vez, el segundo insert choca
    // aca en vez de duplicar el sueldo. Los NULL (movimientos manuales)
    // nunca chocan entre si en Postgres.
    unique("transactions_recurring_rule_date_unique").on(t.recurringRuleId, t.occurredOn),
  ],
);

// Vincula las dos "piernas" de una transferencia entre cuentas propias
// (la salida de una cuenta y la entrada en la otra), para no duplicarla
// en reportes de ingresos/gastos.
export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  fromTransactionId: uuid("from_transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  toTransactionId: uuid("to_transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  household: one(households, {
    fields: [transfers.householdId],
    references: [households.id],
  }),
  fromTransaction: one(transactions, {
    fields: [transfers.fromTransactionId],
    references: [transactions.id],
    relationName: "transferFrom",
  }),
  toTransaction: one(transactions, {
    fields: [transfers.toTransactionId],
    references: [transactions.id],
    relationName: "transferTo",
  }),
}));
