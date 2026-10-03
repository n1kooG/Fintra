import {
  pgTable,
  uuid,
  bigint,
  date,
  smallint,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { accounts } from "./accounts";
import { transactions } from "./transactions";

/**
 * Plan de cuotas de una compra con tarjeta de credito. La compra vive una
 * sola vez, por el monto total, en `transactions` (asi el saldo y el
 * cupo reflejan toda la deuda); este plan dice como se factura: `count`
 * cuotas sin interes, la primera en `firstDueDate` y las demas el mismo
 * dia de pago (`dueDay`) de los meses siguientes. Ver src/lib/cards.ts.
 *
 * Borrar la compra borra el plan (cascade). `firstDueDate` y `dueDay` se
 * guardan en vez de recalcularlos: si despues cambian el dia de cierre o
 * de pago de la tarjeta, las cuotas ya agendadas no se reescriben.
 */
export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: "cascade" }),
    installmentsCount: smallint("installments_count").notNull(),
    // Magnitud positiva de la compra, en la moneda de la tarjeta.
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    firstDueDate: date("first_due_date").notNull(),
    dueDay: smallint("due_day").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("installment_plans_account_idx").on(t.accountId),
    check("installment_plans_count_range", sql`${t.installmentsCount} between 2 and 60`),
    check("installment_plans_total_positive", sql`${t.totalMinor} > 0`),
    check("installment_plans_due_day_range", sql`${t.dueDay} between 1 and 31`),
  ],
);

export const installmentPlansRelations = relations(installmentPlans, ({ one }) => ({
  household: one(households, {
    fields: [installmentPlans.householdId],
    references: [households.id],
  }),
  account: one(accounts, {
    fields: [installmentPlans.accountId],
    references: [accounts.id],
  }),
  transaction: one(transactions, {
    fields: [installmentPlans.transactionId],
    references: [transactions.id],
  }),
}));
