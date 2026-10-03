import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNotices, parseTopics, type NoticeTopic } from "@/lib/notifications";
import { monthKeyOf, todayISO } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { addDays } from "@/lib/recurrence";
import { getBudgetMonth } from "@/server/queries/budgets";
import { getCalendarEvents } from "@/server/queries/calendar";
import { getCardsOverview } from "@/server/queries/cards";
import { budgetStatus } from "@/lib/budgeting";
import { sendPush, vapidConfigured } from "./webpush";

type Subscription = {
  id: string;
  household_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Tipos de aviso que este dispositivo quiere recibir. */
  topics: NoticeTopic[];
};

export type NotifyResult = {
  households: number;
  sent: number;
  removed: number;
  skipped?: string;
};

/**
 * Manda los avisos de hoy a todos los hogares con dispositivos suscritos
 * (vencimientos de tarjeta, cuotas, recurrentes de manana y presupuestos
 * al 80% / 100%). Corre dentro del cron diario con el cliente admin: no
 * hay sesion de usuario, asi que cada lectura se acota por household_id.
 *
 * Cada aviso se "reclama" primero en notification_log (llave unica por
 * hogar): si el cron corre dos veces el mismo dia, o el vencimiento sigue
 * dentro de la ventana al dia siguiente, no se repite. Si ningun
 * dispositivo lo recibio, se libera la llave para reintentarlo.
 */
export async function notifyAllHouseholds(admin: SupabaseClient): Promise<NotifyResult> {
  if (!vapidConfigured()) {
    return { households: 0, sent: 0, removed: 0, skipped: "Faltan las claves VAPID." };
  }

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, household_id, endpoint, p256dh, auth, topics");
  if (error) throw error;

  const byHousehold = new Map<string, Subscription[]>();
  for (const row of data ?? []) {
    const sub: Subscription = { ...row, topics: parseTopics(row.topics) };
    const list = byHousehold.get(sub.household_id) ?? [];
    list.push(sub);
    byHousehold.set(sub.household_id, list);
  }

  const today = todayISO();
  const result: NotifyResult = { households: byHousehold.size, sent: 0, removed: 0 };

  for (const [householdId, subs] of byHousehold) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_currency")
      .eq("household_id", householdId)
      .limit(1)
      .maybeSingle();
    const display = (profile?.display_currency as Currency | undefined) ?? "CLP";

    const [events, budget, cards] = await Promise.all([
      getCalendarEvents(householdId, today, addDays(today, 4), admin),
      getBudgetMonth(householdId, monthKeyOf(today), display, admin),
      getCardsOverview(householdId, admin),
    ]);
    const cardUsage = cards.flatMap((card) => {
      if (
        card.limitMinor === null ||
        card.availableMinor === null ||
        card.limitMinor <= 0n
      ) {
        return [];
      }
      const used = budgetStatus(card.limitMinor - card.availableMinor, card.limitMinor);
      return [
        { id: card.account.id, name: card.account.name, usedPercent: used.percent },
      ];
    });
    const notices = buildNotices({
      today,
      events,
      budgetLines: budget.lines,
      cards: cardUsage,
    });

    const dead = new Set<string>();
    for (const notice of notices) {
      // Cada dispositivo elige que tipos de aviso recibe; si ninguno quiere este, ni se reclama.
      const targets = subs.filter(
        (sub) => !dead.has(sub.id) && sub.topics.includes(notice.topic),
      );
      if (targets.length === 0) continue;

      const { error: claimError } = await admin
        .from("notification_log")
        .insert({ household_id: householdId, key: notice.key });
      if (claimError) continue; // ya se envio (llave unica) o no se pudo reclamar

      let delivered = 0;
      for (const sub of targets) {
        const outcome = await sendPush(sub, {
          title: notice.title,
          body: notice.body,
          url: notice.url,
          tag: notice.tag,
        });
        if (outcome === "sent") delivered++;
        else if (outcome === "gone") dead.add(sub.id);
      }

      if (delivered > 0) result.sent += delivered;
      else {
        await admin
          .from("notification_log")
          .delete()
          .eq("household_id", householdId)
          .eq("key", notice.key);
      }
    }

    if (dead.size > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("id", [...dead]);
      result.removed += dead.size;
    }
  }

  return result;
}
