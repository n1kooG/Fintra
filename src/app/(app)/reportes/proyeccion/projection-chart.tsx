"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrivacy } from "@/components/privacy/privacy-provider";
import { formatMoney, fromMinorUnits, type Currency } from "@/lib/money";

/** Un mes de la proyeccion; los montos viajan como strings de unidades minimas (bigint no cruza al cliente). */
export type ProjectionPoint = {
  monthKey: string;
  endBalance: string;
  lowestBalance: string;
};

const MASK = "•••••";

const monthFormat = new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" });
const longMonthFormat = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const compact = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function utc(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

type Row = ProjectionPoint & { endValue: number; lowestValue: number };

const SERIES = [
  {
    key: "endValue",
    label: "Saldo al cierre",
    color: "var(--series-income)",
    dash: undefined,
  },
  {
    key: "lowestValue",
    label: "Punto más bajo",
    color: "var(--series-expense)",
    dash: "4 3",
  },
] as const;

/**
 * Saldo liquido proyectado mes a mes: una linea para el cierre y otra
 * (punteada, ademas del color) para el punto mas bajo del mes, con la
 * linea del cero marcada. Los valores exactos estan en la tabla de abajo.
 */
export function ProjectionChart({
  points,
  currency,
}: {
  points: ProjectionPoint[];
  currency: Currency;
}) {
  const { hidden } = usePrivacy();

  const rows: Row[] = points.map((p) => ({
    ...p,
    endValue: fromMinorUnits(BigInt(p.endBalance), currency),
    lowestValue: fromMinorUnits(BigInt(p.lowestBalance), currency),
  }));

  return (
    <div>
      <ul
        className="mb-3 flex gap-5 font-mono text-[10.5px] uppercase"
        aria-label="Leyenda"
      >
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <svg aria-hidden width="16" height="4" className="shrink-0">
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                stroke={series.color}
                strokeWidth="2"
                strokeDasharray={series.dash}
              />
            </svg>
            <span className="text-muted-foreground">{series.label}</span>
          </li>
        ))}
      </ul>

      <div
        role="img"
        aria-label={`Saldo líquido proyectado para los próximos ${points.length} meses. Los valores están en la tabla.`}
        className="h-[240px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="monthKey"
              tickLine={false}
              axisLine={{ stroke: "var(--border)", strokeWidth: 1 }}
              tickMargin={8}
              tickFormatter={(monthKey: string) =>
                monthFormat.format(utc(monthKey)).replace(".", "")
              }
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
              tickCount={5}
              tickFormatter={(value: number) => (hidden ? "" : compact.format(value))}
              tick={{
                fill: "var(--muted-foreground)",
                fontSize: 10,
                fontFamily: "var(--font-mono, monospace)",
              }}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={<ChartTooltip currency={currency} hidden={hidden} />}
            />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dash}
                dot={{ r: 2.5, fill: series.color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
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
      <div className="text-muted-foreground mb-1.5 text-[10px] capitalize">
        {longMonthFormat.format(utc(row.monthKey))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">
          {show(row.endBalance)}
        </span>
        <span className="text-muted-foreground">al cierre</span>
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between gap-6">
        <span>punto más bajo</span>
        <span>{show(row.lowestBalance)}</span>
      </div>
    </div>
  );
}
