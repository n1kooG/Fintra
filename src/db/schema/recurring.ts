import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { currencyEnum, recurrenceFrequencyEnum, transactionTypeEnum } from "./enums";

/**
 * Plantilla de un movimiento que se repite (sueldo, arriendo,
 * suscripciones). El motor (src/lib/recurrence.ts) genera un movimiento
 * real por cada ocurrencia vencida y avanza `nextRunOn`. Solo ingresos y
 * gastos: las transferencias recurrentes quedan fuera de esta fase.
 */
export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    type: transactionTypeEnum("type").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // Magnitud positiva en unidades minimas de `currency`; el signo lo
    // pone el tipo al generar cada movimiento (igual que en el alta manual).
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    merchant: text("merchant"),
    notes: text("notes"),
    frequency: recurrenceFrequencyEnum("frequency").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    // Primera ocurrencia todavia no generada.
    nextRunOn: date("next_run_on").notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recurring_rules_due_idx").on(t.householdId, t.active, t.nextRunOn)],
);

export const recurringRulesRelations = relations(recurringRules, ({ one }) => ({
  household: one(households, {
    fields: [recurringRules.householdId],
    references: [households.id],
  }),
  account: one(accounts, {
    fields: [recurringRules.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [recurringRules.categoryId],
    references: [categories.id],
  }),
}));
