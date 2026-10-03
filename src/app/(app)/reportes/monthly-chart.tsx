"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrivacy } from "@/components/privacy/privacy-provider";
import { formatMoney, fromMinorUnits, type Currency } from "@/lib/money";

/** Un mes de la evolucion; los montos viajan como strings de unidades minimas (bigint no cruza al cliente). */
export type MonthlyPoint = {
  monthKey: string;
  income: string;
  /** Gasto en positivo. */
  expense: string;
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

type Row = MonthlyPoint & { incomeValue: number; expenseValue: number };

const SERIES = [
  { key: "incomeValue", label: "Ingresos", color: "var(--series-income)" },
  { key: "expenseValue", label: "Gastos", color: "var(--series-expense)" },
] as const;

/**
 * Ingresos vs gastos por mes: barras agrupadas, siempre ingresos a la
 * izquierda y gastos a la derecha (la posicion tambien identifica la
 * serie, no solo el color), 2px de aire entre las dos barras, tope
 * redondeado de 4px, grilla horizontal fina y solida. La leyenda va
 * siempre; los valores se leen en el tooltip y en la tabla equivalente.
 */
export function MonthlyChart({
  points,
  currency,
}: {
  points: MonthlyPoint[];
  currency: Currency;
}) {
  const { hidden } = usePrivacy();
  const showYear = points.length > 12;

  const rows: Row[] = points.map((p) => ({
    ...p,
    incomeValue: fromMinorUnits(BigInt(p.income), currency),
    expenseValue: fromMinorUnits(BigInt(p.expense), currency),
  }));

  const tickLabel = (monthKey: string) => {
    const month = monthFormat.format(utc(monthKey)).replace(".", "");
    return showYear ? `${month} ${monthKey.slice(2, 4)}` : month;
  };

  return (
    <div>
      <ul
        className="mb-3 flex gap-5 font-mono text-[10.5px] uppercase"
        aria-label="Leyenda"
      >
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-3"
              style={{ backgroundColor: series.color }}
            />
            <span className="text-muted-foreground">{series.label}</span>
          </li>
        ))}
      </ul>

      <div
        role="img"
        aria-label={`Ingresos y gastos de los últimos ${points.length} meses. Los valores están en la tabla.`}
        className="h-[260px] w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="monthKey"
              tickLine={false}
              axisLine={{ stroke: "var(--border)", strokeWidth: 1 }}
              tickMargin={8}
              tickFormatter={tickLabel}
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
              tickFormatter={(value: number) => (hidden ? "" : compact.format(value))}
              tick={{
                fill: "var(--muted-foreground)",
                fontSize: 10,
                fontFamily: "var(--font-mono, monospace)",
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.35 }}
              content={<ChartTooltip currency={currency} hidden={hidden} />}
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                fill={series.color}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
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
  const balance = BigInt(row.income) - BigInt(row.expense);

  return (
    <div className="border-border bg-background border px-3 py-2 font-mono text-[11px]">
      <div className="text-muted-foreground mb-1.5 text-[10px] capitalize">
        {longMonthFormat.format(utc(row.monthKey))}
      </div>
      {SERIES.map((series) => (
        <div key={series.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0.5 w-3"
            style={{ backgroundColor: series.color }}
          />
          <span className="text-foreground text-[13px] font-semibold">
            {show(series.key === "incomeValue" ? row.income : row.expense)}
          </span>
          <span className="text-muted-foreground">{series.label.toLowerCase()}</span>
        </div>
      ))}
      <div className="text-muted-foreground mt-1.5 flex justify-between gap-6">
        <span>balance</span>
        <span>
          {hidden ? MASK : formatMoney(balance, currency, { signDisplay: "always" })}
        </span>
      </div>
    </div>
  );
}
