"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { ALL_TOPICS, parseTopics, type NoticeTopic } from "@/lib/notifications";
import { sendPush, vapidConfigured } from "@/server/push/webpush";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(300).optional(),
});

export type NotificationResult = { ok: boolean; message: string };

/** Guarda la suscripcion push de este dispositivo (si ya estaba, la actualiza). */
export async function savePushSubscription(
  input: z.input<typeof subscriptionSchema>,
): Promise<NotificationResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "La suscripción del dispositivo no es válida." };
  if (!vapidConfigured()) {
    return { ok: false, message: "Los avisos no están configurados en el servidor." };
  }

  const { householdId, userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      household_id: householdId,
      user_id: userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error)
    return { ok: false, message: "No pudimos guardar la suscripción. Intenta de nuevo." };
  return { ok: true, message: "Avisos activados en este dispositivo." };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<NotificationResult> {
  if (!z.string().url().safeParse(endpoint).success) {
    return { ok: false, message: "Dispositivo inválido." };
  }
  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "No pudimos desactivar los avisos." };
  return { ok: true, message: "Avisos desactivados en este dispositivo." };
}

const endpointSchema = z.string().url().max(2048);

/** Tipos de aviso que este dispositivo recibe (todos, si todavia no esta suscrito). */
export async function getPushTopics(endpoint: string): Promise<NoticeTopic[]> {
  if (!endpointSchema.safeParse(endpoint).success) return ALL_TOPICS;
  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("topics")
    .eq("endpoint", endpoint)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? parseTopics(data.topics) : ALL_TOPICS;
}

/** Cambia que tipos de aviso recibe este dispositivo. */
export async function setPushTopics(
  endpoint: string,
  topics: string[],
): Promise<NotificationResult> {
  if (!endpointSchema.safeParse(endpoint).success) {
    return { ok: false, message: "Dispositivo inválido." };
  }
  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ topics: parseTopics(topics) })
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "No pudimos guardar tu elección." };
  return { ok: true, message: "Preferencias guardadas." };
}

/** Manda un aviso de prueba a los dispositivos suscritos de quien lo pide. */
export async function sendTestNotification(): Promise<NotificationResult> {
  if (!vapidConfigured()) {
    return { ok: false, message: "Los avisos no están configurados en el servidor." };
  }
  const { userId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) return { ok: false, message: "No pudimos leer tus dispositivos." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Este dispositivo todavía no está suscrito." };
  }

  let sent = 0;
  const gone: string[] = [];
  for (const sub of data) {
    const outcome = await sendPush(sub, {
      title: "Fintra",
      body: "Así se verán tus avisos de vencimientos y presupuestos.",
      url: "/configuracion",
      tag: "prueba",
    });
    if (outcome === "sent") sent++;
    else if (outcome === "gone") gone.push(sub.id as string);
  }
  if (gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", gone);
  }

  return sent > 0
    ? {
        ok: true,
        message: `Aviso de prueba enviado a ${sent} ${sent === 1 ? "dispositivo" : "dispositivos"}.`,
      }
    : {
        ok: false,
        message: "No pudimos entregar el aviso. Prueba desactivar y volver a activar.",
      };
}
