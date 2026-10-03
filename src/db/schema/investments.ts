import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  date,
  numeric,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";
import { currencyEnum, holdingKindEnum } from "./enums";

/**
 * Instrumento de inversion (deposito a plazo, fondo mutuo, acciones,
 * cripto, dolares...). Es independiente de las cuentas: su valor se lleva
 * con aportes/retiros (holding_flows) y valorizaciones manuales
 * (holding_valuations) — ver src/lib/investments.ts. `currency` es la
 * moneda en que se miden ambos; para dolares conviene medirlos en pesos
 * (lo aportado y lo que valen hoy), asi la ganancia incluye el tipo de
 * cambio.
 */
export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: holdingKindEnum("kind").notNull(),
    currency: currencyEnum("currency").notNull(),
    institution: text("institution"),
    notes: text("notes"),
    // Un instrumento cerrado (vendido o vencido) se archiva: deja de mostrarse
    // y de sumar al patrimonio, pero conserva su historia.
    archived: boolean("archived").notNull().default(false),
    // Como se calcula su valor (ver src/lib/holding-value.ts):
    //  manual     - lo escribes tu (valorizaciones)
    //  fx         - unidades de una moneda con cotizacion (USD, EUR, UF, UTM)
    //  crypto     - unidades de una criptomoneda, precio de mercado diario
    //  priced     - unidades con un precio que escribes tu (cuotas de un fondo, acciones)
    //  fixed_term - deposito a plazo: capital + interes devengado
    valuationMethod: text("valuation_method").notNull().default("manual"),
    // Moneda (fx) o criptomoneda (crypto) cuyas unidades se tienen. Null en el resto.
    assetCode: text("asset_code"),
    // Solo deposito a plazo.
    termStart: date("term_start"),
    termEnd: date("term_end"),
    ratePercent: numeric("rate_percent", { precision: 9, scale: 4 }),
    ratePeriod: text("rate_period"), // 'monthly' | 'annual'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "holdings_valuation_method_valid",
      sql`${t.valuationMethod} in ('manual', 'fx', 'crypto', 'priced', 'fixed_term')`,
    ),
    check(
      "holdings_rate_period_valid",
      sql`${t.ratePeriod} is null or ${t.ratePeriod} in ('monthly', 'annual')`,
    ),
    check(
      "holdings_fixed_term_complete",
      sql`${t.valuationMethod} <> 'fixed_term' or (${t.termStart} is not null and ${t.termEnd} is not null and ${t.ratePercent} is not null and ${t.ratePeriod} is not null)`,
    ),
    check(
      "holdings_units_asset_required",
      sql`${t.valuationMethod} not in ('fx', 'crypto') or ${t.assetCode} is not null`,
    ),
  ],
);

/** Aporte (+) o retiro (-) de capital. Nunca cero. */
export const holdingFlows = pgTable(
  "holding_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    occurredOn: date("occurred_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    // Unidades compradas (+) o vendidas (-) en este movimiento, solo en
    // instrumentos valorizados por unidades (fx, crypto, priced). El monto
    // de arriba sigue siendo el capital en la moneda del instrumento.
    units: numeric("units", { precision: 28, scale: 8 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("holding_flows_holding_idx").on(t.holdingId, t.occurredOn),
    check("holding_flows_amount_nonzero", sql`${t.amountMinor} <> 0`),
  ],
);

/** Cuanto vale el instrumento en una fecha. Una por dia: guardar de nuevo reemplaza el valor. */
export const holdingValuations = pgTable(
  "holding_valuations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    valuedOn: date("valued_on").notNull(),
    valueMinor: bigint("value_minor", { mode: "bigint" }).notNull(),
    // Precio por unidad, en la moneda del instrumento, cuando la fila es un
    // punto de precio (crypto/priced); null si es un valor total escrito a mano.
    unitPrice: numeric("unit_price", { precision: 28, scale: 6 }),
    // 'manual' (lo escribio una persona) o 'coingecko' (precio de mercado automatico).
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("holding_valuations_holding_date_unique").on(t.holdingId, t.valuedOn),
    check("holding_valuations_value_nonnegative", sql`${t.valueMinor} >= 0`),
  ],
);

export const holdingsRelations = relations(holdings, ({ one, many }) => ({
  household: one(households, {
    fields: [holdings.householdId],
    references: [households.id],
  }),
  flows: many(holdingFlows),
  valuations: many(holdingValuations),
}));

export const holdingFlowsRelations = relations(holdingFlows, ({ one }) => ({
  holding: one(holdings, {
    fields: [holdingFlows.holdingId],
    references: [holdings.id],
  }),
}));

export const holdingValuationsRelations = relations(holdingValuations, ({ one }) => ({
  holding: one(holdings, {
    fields: [holdingValuations.holdingId],
    references: [holdings.id],
  }),
}));
