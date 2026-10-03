/**
 * Que avisos mandar hoy. Logica pura: recibe lo que viene en el
 * calendario y el estado de los presupuestos, y devuelve avisos con una
 * `key` estable. La key identifica al aviso (el vencimiento o el
 * presupuesto de ESE mes), asi el cron puede registrar cuales ya salieron
 * y no repetirlos cada dia.
 *
 * Se avisa:
 * - Facturacion de tarjeta: desde 3 dias antes.
 * - Cuota de prestamo: el dia anterior y el mismo dia.
 * - Deposito a plazo que vence: desde 3 dias antes.
 * - Recurrente (ingreso o gasto): el dia anterior.
 * - Presupuesto: al llegar al 80% y al llegar al 100% (una vez cada uno).
 * - Cupo de tarjeta: al pasar el 80% (una vez al mes).
 */

import type { BudgetLineView } from "./budgeting";
import type { CalendarEvent } from "./calendar";
import { daysBetween, monthKeyOf } from "./dates";
import { formatMoney } from "./money";

/** Tipos de aviso que cada dispositivo puede activar o silenciar. */
export const NOTICE_TOPICS = [
  {
    id: "cards",
    label: "Tarjetas",
    hint: "Facturación próxima y cupo casi agotado",
  },
  { id: "loans", label: "Cuotas de préstamos", hint: "El día anterior y el mismo día" },
  { id: "deposits", label: "Depósitos a plazo", hint: "Cuando se acerca su vencimiento" },
  {
    id: "recurring",
    label: "Sueldo y cargos recurrentes",
    hint: "Lo que llega o se descuenta mañana",
  },
  { id: "budgets", label: "Presupuestos", hint: "Al llegar al 80% y al 100%" },
] as const;

export type NoticeTopic = (typeof NOTICE_TOPICS)[number]["id"];

export const ALL_TOPICS: NoticeTopic[] = NOTICE_TOPICS.map((t) => t.id);

/** Deja solo temas conocidos y sin repetir (lo que viene de la BD o de un formulario no es de fiar). */
export function parseTopics(values: unknown): NoticeTopic[] {
  if (!Array.isArray(values)) return [];
  return ALL_TOPICS.filter((topic) => values.includes(topic));
}

export type Notice = {
  /** Que tipo de aviso es: cada dispositivo elige cuales recibir. */
  topic: NoticeTopic;
  /** Identifica el aviso para no repetirlo (se guarda en notification_log). */
  key: string;
  /** Mismo tag = un aviso nuevo reemplaza al anterior en el telefono. */
  tag: string;
  title: string;
  body: string;
  /** Pantalla que abre al tocar el aviso. */
  url: string;
};

export const CARD_LEAD_DAYS = 3;

/** Desde este porcentaje de cupo usado se avisa. */
export const CARD_LIMIT_ALERT_PERCENT = 80;

export type CardUsage = { id: string; name: string; usedPercent: number };

function when(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

export function buildNotices(args: {
  today: string;
  events: CalendarEvent[];
  budgetLines: BudgetLineView[];
  /** Uso del cupo de cada tarjeta con cupo definido. */
  cards?: CardUsage[];
}): Notice[] {
  const { today, events, budgetLines, cards = [] } = args;
  const notices: Notice[] = [];

  for (const event of events) {
    if (event.amountMinor === null) continue;
    const days = daysBetween(today, event.date);
    if (days < 0) continue;
    const amount = formatMoney(
      event.amountMinor < 0n ? -event.amountMinor : event.amountMinor,
      event.currency,
    );

    if (event.kind === "card_billing" && days <= CARD_LEAD_DAYS) {
      notices.push({
        topic: "cards",
        key: `card:${event.id}`,
        tag: `card:${event.id}`,
        title: event.label,
        body: `Vence ${when(days)} · ${amount}${event.estimated ? " (estimado)" : ""}`,
        url: "/tarjetas",
      });
    } else if (event.kind === "deposit_maturity" && days <= CARD_LEAD_DAYS) {
      notices.push({
        topic: "deposits",
        key: `maturity:${event.id}`,
        tag: `maturity:${event.id}`,
        title: event.label,
        body: `Vence ${when(days)} · recibirás ${amount}`,
        url: "/inversiones",
      });
    } else if (event.kind === "loan" && days <= 1) {
      notices.push({
        topic: "loans",
        key: `due:${event.id}`,
        tag: `due:${event.id}`,
        title: event.label,
        body: `Vence ${when(days)} · ${amount}`,
        url: "/tarjetas",
      });
    } else if ((event.kind === "expense" || event.kind === "income") && days === 1) {
      notices.push({
        topic: "recurring",
        key: `due:${event.id}`,
        tag: `due:${event.id}`,
        title: event.label,
        body:
          event.kind === "income"
            ? `Mañana debería llegar ${amount}`
            : `Mañana se descuenta ${amount}`,
        url: "/calendario",
      });
    }
  }

  for (const card of cards) {
    if (card.usedPercent < CARD_LIMIT_ALERT_PERCENT) continue;
    notices.push({
      topic: "cards",
      key: `limit:${card.id}:${monthKeyOf(today)}`,
      tag: `limit:${card.id}`,
      title: `${card.name}: ${card.usedPercent}% del cupo usado`,
      body:
        card.usedPercent >= 100
          ? "Llegaste al límite de tu cupo."
          : "Te estás acercando al límite de tu cupo.",
      url: "/tarjetas",
    });
  }

  for (const line of budgetLines) {
    const spent = formatMoney(line.spentMinor, line.currency);
    const budget = formatMoney(line.amountMinor, line.currency);
    if (line.status === "over") {
      notices.push({
        topic: "budgets",
        key: `budget:${line.id}:over`,
        tag: `budget:${line.id}`,
        title: `Presupuesto ${line.remainingMinor < 0n ? "excedido" : "al tope"}: ${line.categoryName}`,
        body: `Llevas ${line.percent}% (${spent} de ${budget})`,
        url: "/presupuestos",
      });
    } else if (line.status === "warning") {
      notices.push({
        topic: "budgets",
        key: `budget:${line.id}:warning`,
        tag: `budget:${line.id}`,
        title: `${line.categoryName}: ${line.percent}% del presupuesto`,
        body: `Te quedan ${formatMoney(line.remainingMinor, line.currency)} de ${budget}`,
        url: "/presupuestos",
      });
    }
  }

  return notices;
}
