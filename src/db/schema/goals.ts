import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { currencyEnum } from "./enums";

/**
 * Meta de ahorro con monto objetivo y fecha opcional. Los aportes
 * (goal_contributions) son un registro propio de la meta: NO mueven
 * saldos de cuentas — son "cuanto llevo juntado para esto", sin importar
 * en que cuenta este la plata. Todo se mide en la moneda de la meta.
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetMinor: bigint("target_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    targetDate: date("target_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("goals_target_positive", sql`${t.targetMinor} > 0`)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    occurredOn: date("occurred_on").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_contributions_goal_idx").on(t.goalId, t.occurredOn),
    check("goal_contributions_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const goalsRelations = relations(goals, ({ one, many }) => ({
  household: one(households, {
    fields: [goals.householdId],
    references: [households.id],
  }),
  contributions: many(goalContributions),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, {
    fields: [goalContributions.goalId],
    references: [goals.id],
  }),
}));
