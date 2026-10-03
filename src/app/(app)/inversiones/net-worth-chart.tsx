"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrivacy } from "@/components/privacy/privacy-provider";
import { formatMoney, fromMinorUnits, type Currency } from "@/lib/money";

/** Un punto de la curva; los montos viajan como strings de unidades minimas (bigint no cruza al cliente). */
export type ChartPoint = {
  date: string;
  net: string;
  assets: string;
  liabilities: string;
};

const MASK = "•••••";

const monthFormat = new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function utc(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const compact = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type Row = ChartPoint & { value: number; isLast: boolean };

/**
 * Curva del patrimonio neto: una sola serie (linea de 2px con un lavado
 * suave debajo), marcador de 8px con anillo del color de la superficie en
 * el ultimo punto, cuadricula horizontal fina y solida, y la etiqueta solo
 * en el extremo — el resto de los valores se lee con la cruz del tooltip
 * o en la tabla que acompana al grafico. Respeta el modo privacidad.
 */
export function NetWorthChart({
  points,
  currency,
}: {
  points: ChartPoint[];
  currency: Currency;
}) {
  const { hidden } = usePrivacy();

  const rows: Row[] = points.map((point, i) => ({
    ...point,
    value: fromMinorUnits(BigInt(point.net), currency),
    isLast: i === points.length - 1,
  }));
  const showYear = points.length > 12;

  const tickLabel = (date: string, index: number) => {
    if (index === points.length - 1) return "hoy";
    const month = monthFormat.format(utc(date)).replace(".", "");
    return showYear ? `${month} ${date.slice(2, 4)}` : month;
  };

  const first = points[0];
  const last = points[points.length - 1];
  const summary = hidden
    ? "Curva del patrimonio neto (montos ocultos)"
    : `Patrimonio neto de ${dayFormat.format(utc(first.date))} a ${dayFormat.format(utc(last.date))}: de ${formatMoney(BigInt(first.net), currency)} a ${formatMoney(BigInt(last.net), currency)}`;

  return (
    <div role="img" aria-label={summary} className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 28, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: "var(--border)", strokeWidth: 1 }}
            tickMargin={8}
            interval="preserveStartEnd"
            tickFormatter={(date: string, index: number) => tickLabel(date, index)}
            tick={{
              fill: "var(--muted-foreground)",
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
            }}
          />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => (hidden ? "" : compact.format(value))}
            tick={{
              fill: "var(--muted-foreground)",
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
            }}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={<ChartTooltip currency={currency} hidden={hidden} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            baseValue="dataMin"
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="var(--foreground)"
            fillOpacity={0.1}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: Row }) => (
              <EndDot key={props.index} {...props} currency={currency} hidden={hidden} />
            )}
            activeDot={{
              r: 4,
              fill: "var(--foreground)",
              stroke: "var(--background)",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Solo el ultimo punto lleva marcador y etiqueta. */
function EndDot({
  cx,
  cy,
  payload,
  currency,
  hidden,
}: {
  cx?: number;
  cy?: number;
  payload?: Row;
  currency: Currency;
  hidden: boolean;
}) {
  if (!payload?.isLast || cx === undefined || cy === undefined) return <g />;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--foreground)"
        stroke="var(--background)"
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy - 14}
        textAnchor="end"
        fill="var(--muted-foreground)"
        fontSize={11}
        fontFamily="var(--font-mono, monospace)"
      >
        {hidden ? MASK : formatMoney(BigInt(payload.net), currency)}
      </text>
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  currency,
  hidden,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  currency: Currency;
  hidden: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const show = (value: string) => (hidden ? MASK : formatMoney(BigInt(value), currency));

  return (
    <div className="border-border bg-background border px-3 py-2 font-mono text-[11px]">
      <div className="text-muted-foreground mb-1.5 text-[10px] uppercase">
        {row.isLast ? "Hoy" : dayFormat.format(utc(row.date))}
      </div>
      <div className="flex items-center gap-2">
        <span className="bg-foreground inline-block h-0.5 w-3" aria-hidden />
        <span className="text-foreground text-[13px] font-semibold">{show(row.net)}</span>
        <span className="text-muted-foreground">patrimonio neto</span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex justify-between gap-6">
        <span>activos</span>
        <span>{show(row.assets)}</span>
      </div>
      <div className="text-muted-foreground flex justify-between gap-6">
        <span>pasivos</span>
        <span>{show(row.liabilities)}</span>
      </div>
    </div>
  );
}
