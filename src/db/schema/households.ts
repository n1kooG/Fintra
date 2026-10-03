import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { currencyEnum, householdRoleEnum } from "./enums";

/**
 * Un household es el espacio de datos compartido: hoy tiene un solo
 * miembro (tú), pero el modelo ya soporta invitar a alguien mas sin
 * migrar nada — ver Fase 1 del plan.
 */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// auth.users es la tabla de Supabase Auth (schema "auth", fuera de Drizzle).
// household_members.userId referencia auth.users.id por convencion, sin FK
// declarada aca porque Drizzle no gestiona el schema "auth".
export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: householdRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const profiles = pgTable("profiles", {
  // Mismo id que auth.users.id (1:1) — se crea via trigger en Supabase
  // (supabase/policies.sql) cuando alguien se registra.
  id: uuid("id").primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  // Moneda en la que se muestran los totales consolidados (dashboard,
  // cuentas, resumen de movimientos). Cada movimiento sigue guardado en
  // su propia moneda — esto es solo la vista.
  displayCurrency: currencyEnum("display_currency").notNull().default("CLP"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  profiles: many(profiles),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  household: one(households, {
    fields: [profiles.householdId],
    references: [households.id],
  }),
}));
