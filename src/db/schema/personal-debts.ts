import { pgTable, uuid, text, bigint, date, timestamp, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { currencyEnum, debtDirectionEnum } from "./enums";

/**
 * Deuda informal entre personas ("le preste a Fran", "le debo a Cata"):
 * un registro simple, sin tabla de amortizacion ni pagos parciales — se
 * marca como saldada (`settledOn`) cuando se devuelve. No mueve saldos
 * de cuentas ni entra al patrimonio neto.
 */
export const personalDebts = pgTable(
  "personal_debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    person: text("person").notNull(),
    direction: debtDirectionEnum("direction").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    occurredOn: date("occurred_on").notNull(),
    notes: text("notes"),
    settledOn: date("settled_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("personal_debts_amount_positive", sql`${t.amountMinor} > 0`)],
);

export const personalDebtsRelations = relations(personalDebts, ({ one }) => ({
  household: one(households, {
    fields: [personalDebts.householdId],
    references: [households.id],
  }),
}));
