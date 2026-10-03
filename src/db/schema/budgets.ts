import {
  pgTable,
  uuid,
  bigint,
  date,
  timestamp,
  boolean,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { categories } from "./categories";
import { currencyEnum } from "./enums";

/**
 * Tope mensual de gasto para una categoria. `month` es siempre el primer
 * dia del mes ("2026-10-01"). Hay a lo sumo un presupuesto por categoria
 * y mes: guardar de nuevo reemplaza el monto. Se mide en `currency`, la
 * moneda en que se definio (ver src/lib/budgeting.ts).
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    // Si suma lo que sobro del mes anterior (ver src/lib/budgeting.ts).
    rollover: boolean("rollover").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("budgets_household_category_month_unique").on(
      t.householdId,
      t.categoryId,
      t.month,
    ),
    index("budgets_household_month_idx").on(t.householdId, t.month),
    check("budgets_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

/**
 * Tope total de gasto de un mes (todo el gasto, con o sin presupuesto por
 * categoria). A lo sumo uno por mes; guardar de nuevo reemplaza el monto.
 */
export const budgetTotals = pgTable(
  "budget_totals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("budget_totals_household_month_unique").on(t.householdId, t.month),
    check("budget_totals_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const budgetsRelations = relations(budgets, ({ one }) => ({
  household: one(households, {
    fields: [budgets.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));
