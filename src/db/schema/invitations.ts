import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { householdRoleEnum } from "./enums";

/**
 * Invitacion a unirse a un espacio compartido. Se entrega como un enlace
 * con un token secreto de un solo uso; aqui solo se guarda su HASH (si la
 * base se filtrara, los enlaces no se podrian reconstruir). Va atada a un
 * correo: solo quien tenga esa cuenta puede aceptarla.
 *
 * Sin politicas de RLS a proposito (como notification_log): solo el
 * servidor la lee y escribe, despues de comprobar que quien pide es el
 * propietario del espacio.
 */
export const householdInvitations = pgTable(
  "household_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    role: householdRoleEnum("role").notNull().default("member"),
    invitedBy: uuid("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("household_invitations_household_idx").on(t.householdId)],
);

export const householdInvitationsRelations = relations(
  householdInvitations,
  ({ one }) => ({
    household: one(households, {
      fields: [householdInvitations.householdId],
      references: [households.id],
    }),
  }),
);
