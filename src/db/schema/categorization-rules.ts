import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { categories } from "./categories";

/**
 * "Si el comercio contiene `pattern`, la categoria es `categoryId`" —
 * ver src/lib/categorization.ts para el criterio de coincidencia. El
 * patron se guarda normalizado (minusculas, sin tildes) para que la
 * restriccion de unicidad no deje pasar "Uber" y "uber" como distintos.
 */
export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("categorization_rules_household_pattern_unique").on(t.householdId, t.pattern),
  ],
);

export const categorizationRulesRelations = relations(categorizationRules, ({ one }) => ({
  household: one(households, {
    fields: [categorizationRules.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [categorizationRules.categoryId],
    references: [categories.id],
  }),
}));
