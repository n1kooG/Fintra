import {
  pgTable,
  uuid,
  date,
  numeric,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { currencyEnum } from "./enums";

/**
 * Cotizacion diaria por moneda (USD, UF, UTM) contra CLP, sincronizada
 * desde mindicador.cl (ver src/lib/fx.ts, Fase 2). Cada transaccion en
 * moneda distinta a CLP guarda su propio fxRate al momento de ocurrir
 * (transactions.fxRate) — esta tabla es la fuente para ese snapshot y
 * para convertir montos historicos en reportes.
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    currency: currencyEnum("currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    source: text("source").notNull().default("mindicador.cl"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("exchange_rates_date_currency_unique").on(t.date, t.currency)],
);
