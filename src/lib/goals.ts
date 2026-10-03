/**
 * Metas de ahorro: avance, ritmo actual y proyeccion de la fecha en que
 * se cumplen. Logica pura — las consultas viven en src/server/queries.
 *
 * Ritmo = lo aportado en la ventana reciente / dias de la ventana. La
 * ventana son los ultimos PACE_WINDOW_DAYS dias (o desde el primer
 * aporte, si es mas reciente), con un minimo de MIN_WINDOW_DAYS para que
 * un primer aporte grande no proyecte "manana" ni un aporte de ayer un
 * ritmo absurdo. Aportes con fecha futura todavia no cuentan.
 */

import { daysBetween } from "./dates";
import { addDays } from "./recurrence";

export const PACE_WINDOW_DAYS = 90;
export const MIN_WINDOW_DAYS = 30;

export type GoalContribution = { amountMinor: bigint; occurredOn: string };

export type GoalStatus =
  /** Ya se junto el monto objetivo. */
  | "completed"
  /** Con fecha objetivo: al ritmo actual se cumple a tiempo. */
  | "on_track"
  /** Con fecha objetivo: al ritmo actual no se llega (o la fecha ya paso). */
  | "behind"
  /** Sin fecha objetivo, pero con aportes recientes: se proyecta cuando se cumple. */
  | "no_date"
  /** Sin aportes en la ventana reciente: no hay ritmo con el que proyectar. */
  | "no_pace";

export type GoalProgress = {
  savedMinor: bigint;
  remainingMinor: bigint;
  /** 0 a 100, entero hacia abajo. */
  percent: number;
  /** Aporte mensual promedio al ritmo actual. */
  paceMinorPerMonth: bigint;
  /** Fecha estimada de cumplimiento al ritmo actual, o null sin ritmo o ya cumplida. */
  projectedDate: string | null;
  /** Cuanto aportar por mes para llegar justo a la fecha objetivo; null sin fecha, vencida o cumplida. */
  requiredPerMonthMinor: bigint | null;
  status: GoalStatus;
};

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function goalProgress(
  goal: {
    targetMinor: bigint;
    targetDate: string | null;
    contributions: GoalContribution[];
  },
  today: string,
): GoalProgress {
  const counted = goal.contributions.filter((c) => c.occurredOn <= today);
  const savedMinor = counted.reduce((sum, c) => sum + c.amountMinor, 0n);
  const remainingMinor =
    goal.targetMinor > savedMinor ? goal.targetMinor - savedMinor : 0n;

  const cappedSaved = savedMinor >= goal.targetMinor ? goal.targetMinor : savedMinor;
  const percent =
    goal.targetMinor > 0n && savedMinor > 0n
      ? Number((cappedSaved * 100n) / goal.targetMinor)
      : 0;

  let inWindow = 0n;
  let windowDays = MIN_WINDOW_DAYS;
  if (counted.length > 0) {
    const first = counted.reduce(
      (min, c) => (c.occurredOn < min ? c.occurredOn : min),
      today,
    );
    const earliest = addDays(today, -PACE_WINDOW_DAYS);
    const windowStart = first > earliest ? first : earliest;
    windowDays = Math.max(MIN_WINDOW_DAYS, daysBetween(windowStart, today) + 1);
    inWindow = counted
      .filter((c) => c.occurredOn >= windowStart)
      .reduce((sum, c) => sum + c.amountMinor, 0n);
  }
  const hasPace = inWindow > 0n;
  const paceMinorPerMonth = hasPace ? (inWindow * 30n) / BigInt(windowDays) : 0n;

  const completed = remainingMinor === 0n;
  const projectedDate =
    !completed && hasPace
      ? addDays(today, Number(ceilDiv(remainingMinor * BigInt(windowDays), inWindow)))
      : null;

  let requiredPerMonthMinor: bigint | null = null;
  if (!completed && goal.targetDate && goal.targetDate > today) {
    const daysLeft = BigInt(daysBetween(today, goal.targetDate));
    const perMonth = ceilDiv(remainingMinor * 30n, daysLeft);
    // Con menos de un mes por delante, lo que falta ES lo que hay que aportar.
    requiredPerMonthMinor = perMonth > remainingMinor ? remainingMinor : perMonth;
  }

  let status: GoalStatus;
  if (completed) status = "completed";
  else if (goal.targetDate) {
    if (goal.targetDate <= today) status = "behind";
    else if (!projectedDate) status = "no_pace";
    else status = projectedDate <= goal.targetDate ? "on_track" : "behind";
  } else {
    status = hasPace ? "no_date" : "no_pace";
  }

  return {
    savedMinor,
    remainingMinor,
    percent,
    paceMinorPerMonth,
    projectedDate,
    requiredPerMonthMinor,
    status,
  };
}
