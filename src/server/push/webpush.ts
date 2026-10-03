import "server-only";
import webpush from "web-push";

/** Estan las tres variables VAPID? Sin ellas los avisos quedan apagados, sin romper nada. */
export function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

let configured = false;

function configure(): boolean {
  if (!vapidConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Envia un aviso a un dispositivo. `gone` significa que el dispositivo ya
 * no existe (404/410: desinstalo la app o revoco el permiso) y su
 * suscripcion se puede borrar; `failed`, que fallo por otra razon (red,
 * servicio caido) y vale la pena reintentar mas tarde.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<"sent" | "gone" | "failed"> {
  if (!configure()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
