import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { buildIcs } from "@/lib/ics";
import { monthBounds, monthKeyOf, shiftMonth, todayISO } from "@/lib/dates";
import { getCalendarEvents } from "@/server/queries/calendar";

const DEFAULT_MONTHS = 3;
const MAX_MONTHS = 12;

/**
 * Descarga los eventos del calendario financiero (desde hoy hasta el fin del
 * mes que corresponda, ?meses=1..12, por defecto 3) como archivo .ics para
 * importarlo a Google Calendar, Apple Calendar u Outlook. Requiere sesion.
 */
export async function GET(request: Request) {
  const current = await getCurrentHousehold();
  if (!current) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const requested = Number(new URL(request.url).searchParams.get("meses"));
  const months =
    Number.isInteger(requested) && requested >= 1 && requested <= MAX_MONTHS
      ? requested
      : DEFAULT_MONTHS;

  const today = todayISO();
  const to = monthBounds(shiftMonth(monthKeyOf(today), months - 1)).to;
  const events = await getCalendarEvents(current.householdId, today, to);

  return new NextResponse(
    buildIcs(events, { calendarName: "Fintra · calendario financiero" }),
    {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="fintra-calendario-${today}.ics"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
