import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { households } from "./households";

/**
 * Dispositivo suscrito a notificaciones push (un navegador o una PWA
 * instalada). `endpoint`, `p256dh` y `auth` son lo que entrega el
 * navegador al suscribirse y lo que hace falta para enviarle un aviso:
 * son secretos del dispositivo, por eso solo su dueno puede leerlos (ver
 * supabase/policies.sql). El endpoint es unico: reinstalar la app en el
 * mismo navegador reemplaza la fila en vez de duplicarla.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  /** Tipos de aviso que este dispositivo quiere recibir (ver NOTICE_TOPICS). */
  topics: text("topics")
    .array()
    .notNull()
    .default(sql`ARRAY['cards','loans','deposits','recurring','budgets']::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Registro de avisos ya enviados, para no repetir el mismo (la llave
 * incluye el vencimiento o el presupuesto del mes). Solo lo escribe el
 * cron con la service role: los usuarios no tienen politicas sobre esta
 * tabla.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("notification_log_household_key_unique").on(t.householdId, t.key)],
);

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  household: one(households, {
    fields: [pushSubscriptions.householdId],
    references: [households.id],
  }),
}));

export const notificationLogRelations = relations(notificationLog, ({ one }) => ({
  household: one(households, {
    fields: [notificationLog.householdId],
    references: [households.id],
  }),
}));
