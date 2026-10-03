import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { getCalendarEvents } from "@/server/queries/calendar";
import { Amount } from "@/components/money/amount";
import {
  groupByDate,
  monthGrid,
  weekOf,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/calendar";
import {
  formatMonthLabel,
  formatShortDay,
  monthBounds,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
  todayISO,
} from "@/lib/dates";
import { addDays } from "@/lib/recurrence";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_MARKS_PER_DAY = 3;

const MARK_CLASS: Record<CalendarEventKind, string> = {
  income: "text-income",
  expense: "text-expense",
  card_billing: "text-expense",
  loan: "text-expense",
  card_close: "text-muted-foreground",
  deposit_maturity: "text-income",
};

/** El signo va impreso (+ / −): el color solo lo refuerza. */
function markText(event: CalendarEvent): string {
  // Sin signo: ni el cierre de una tarjeta ni el vencimiento de un deposito son un movimiento.
  if (event.kind === "card_close" || event.kind === "deposit_maturity")
    return event.label;
  return `${event.kind === "income" ? "+" : "−"} ${event.label}`;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  const params = await searchParams;
  const today = todayISO();
  const todayMonth = monthKeyOf(today);
  const monthKey = parseMonthKey(params.mes) ?? todayMonth;
  const { from, to } = monthBounds(monthKey);

  const agendaTo = addDays(today, 14);
  const week = weekOf(today);
  const events = await getCalendarEvents(
    current.householdId,
    [from, today, week[0]].sort()[0],
    [to, agendaTo, week[6]].sort().at(-1)!,
  );

  const byDate = groupByDate(events);
  const agenda = events.filter((e) => e.date >= today && e.date <= agendaTo);
  const grid = monthGrid(monthKey);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-6 py-8 md:px-11">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium md:text-[23px]">Calendario financiero</h1>
        <div className="flex flex-wrap items-center gap-5">
          {/* <a> y no <Link>: es una descarga, no una navegacion (y Link la pre-cargaria). */}
          <a
            href="/api/export/calendario?meses=3"
            className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
          >
            llevar a mi calendario (.ics)
          </a>
          <Link
            href="/tarjetas"
            className="text-muted-foreground font-mono text-[10.5px] uppercase"
          >
            tarjetas y deudas
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {/* Escritorio: el mes completo. */}
          <div className="hidden md:block">
            <div className="border-border flex items-center justify-between border-y py-3">
              <Link
                href={`/calendario?mes=${shiftMonth(monthKey, -1)}`}
                aria-label="Mes anterior"
                className="text-muted-foreground font-mono text-[12px]"
              >
                ‹
              </Link>
              <span className="font-mono text-[11.5px] tracking-[0.08em] uppercase">
                {formatMonthLabel(monthKey)}
              </span>
              <Link
                href={`/calendario?mes=${shiftMonth(monthKey, 1)}`}
                aria-label="Mes siguiente"
                className="text-muted-foreground font-mono text-[12px]"
              >
                ›
              </Link>
            </div>

            <div className="grid grid-cols-7">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-muted-foreground py-2 font-mono text-[10px] tracking-[0.1em] uppercase"
                >
                  {day}
                </div>
              ))}
              {grid.flat().map((date, i) => {
                if (!date) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="border-border min-h-[92px] border-t"
                    />
                  );
                }
                const dayEvents = byDate.get(date) ?? [];
                return (
                  <div
                    key={date}
                    className="border-border flex min-h-[92px] flex-col gap-1 border-t border-r p-2 [&:nth-child(7n)]:border-r-0"
                  >
                    <span
                      className={
                        date === today
                          ? "border-foreground w-fit border-b font-mono text-[11px] font-semibold"
                          : "text-muted-foreground font-mono text-[11px]"
                      }
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {dayEvents.slice(0, MAX_MARKS_PER_DAY).map((event) => (
                      <span
                        key={event.id}
                        title={event.label}
                        className={`truncate font-mono text-[9.5px] ${MARK_CLASS[event.kind]}`}
                      >
                        {markText(event)}
                      </span>
                    ))}
                    {dayEvents.length > MAX_MARKS_PER_DAY ? (
                      <span className="text-muted-foreground font-mono text-[9.5px]">
                        +{dayEvents.length - MAX_MARKS_PER_DAY} más
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-3 font-mono text-[10px]">
              + ingreso · − egreso, cuota o facturación de tarjeta · el calendario muestra
              ingresos y obligaciones programadas, no cada gasto suelto.
            </p>
          </div>

          {/* Movil: la semana actual (una grilla de 7 columnas por mes no se lee en pantalla chica). */}
          <div className="md:hidden">
            <div className="border-border flex border-b">
              {week.map((date, i) => {
                const count = byDate.get(date)?.length ?? 0;
                return (
                  <div
                    key={date}
                    className={`flex-1 pt-2 pb-2 text-center ${date === today ? "border-foreground border-b" : ""}`}
                  >
                    <div className="text-muted-foreground font-mono text-[9px] uppercase">
                      {WEEKDAYS[i]}
                    </div>
                    <div className="font-mono text-[13px]">
                      {Number(date.slice(8, 10))}
                    </div>
                    <div
                      className="text-muted-foreground h-3 font-mono text-[8px]"
                      aria-label={count > 0 ? `${count} eventos` : undefined}
                    >
                      {"•".repeat(Math.min(count, 3))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
            Próximos 14 días
          </h2>
          {agenda.length === 0 ? (
            <p className="text-muted-foreground font-mono text-[11px]">
              Sin vencimientos ni ingresos programados
            </p>
          ) : (
            agenda.map((event) => (
              <div
                key={event.id}
                className="border-border flex flex-col gap-0.5 border-b py-2"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-muted-foreground w-12 shrink-0 font-mono text-[10px]">
                    {formatShortDay(event.date)}
                  </span>
                  <span className="flex-1 text-[13.5px] italic">{event.label}</span>
                  {event.amountMinor !== null ? (
                    <Amount
                      amountMinor={event.amountMinor}
                      currency={event.currency}
                      tone={event.amountMinor > 0n ? "income" : "expense"}
                      signDisplay="always"
                      className="text-[12.5px]"
                    />
                  ) : null}
                </div>
                {event.estimated ? (
                  <span className="text-muted-foreground pl-[60px] font-mono text-[9.5px] uppercase">
                    estimado: el ciclo sigue abierto
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
