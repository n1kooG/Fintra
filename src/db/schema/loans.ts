import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  smallint,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { currencyEnum } from "./enums";

/**
 * Prestamo formal (consumo, hipotecario, automotriz): lo que dice el
 * contrato — monto, numero de cuotas, valor de la cuota y fecha de la
 * primera. La tasa y la tabla de amortizacion se DERIVAN de esos datos
 * (src/lib/loans.ts), asi no pueden quedar inconsistentes entre si.
 *
 * No genera movimientos: la cuota se registra como un gasto normal cuando
 * se paga. Cuenta como pasivo (capital pendiente) en el patrimonio neto.
 */
export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lender: text("lender"), // "Banco Falabella"
    principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    installmentsCount: smallint("installments_count").notNull(),
    installmentMinor: bigint("installment_minor", { mode: "bigint" }).notNull(),
    firstDueDate: date("first_due_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("loans_principal_positive", sql`${t.principalMinor} > 0`),
    check("loans_installment_positive", sql`${t.installmentMinor} > 0`),
    check("loans_count_range", sql`${t.installmentsCount} between 1 and 600`),
  ],
);

/**
 * Abono extraordinario al capital de un prestamo (prepago). Baja el capital
 * pendiente desde su fecha y recalcula la tabla (ver src/lib/loans.ts):
 * `shorten_term` mantiene la cuota y termina antes; `reduce_installment`
 * mantiene el plazo y baja la cuota. No mueve saldos de cuentas.
 */
export const loanPrepayments = pgTable(
  "loan_prepayments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    paidOn: date("paid_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    mode: text("mode").notNull().default("shorten_term"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loan_prepayments_loan_idx").on(t.loanId, t.paidOn),
    check("loan_prepayments_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "loan_prepayments_mode_valid",
      sql`${t.mode} in ('shorten_term', 'reduce_installment')`,
    ),
  ],
);

export const loansRelations = relations(loans, ({ one, many }) => ({
  household: one(households, {
    fields: [loans.householdId],
    references: [households.id],
  }),
  prepayments: many(loanPrepayments),
}));

export const loanPrepaymentsRelations = relations(loanPrepayments, ({ one }) => ({
  loan: one(loans, {
    fields: [loanPrepayments.loanId],
    references: [loans.id],
  }),
}));
