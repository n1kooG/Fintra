"use client";

import { useState } from "react";
import {
  FIRST_YEAR,
  LAST_YEAR,
  formatRetention,
  fromGross,
  fromNet,
} from "@/lib/honorarios";
import { formatMoney } from "@/lib/money";

const labelClass =
  "text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase";
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => LAST_YEAR - i);

type Mode = "gross" | "net";

/** Calculadora de boleta de honorarios: del bruto al liquido y viceversa, segun la retencion del año. */
export function HonorariosCalculator({ defaultYear }: { defaultYear: number }) {
  const [mode, setMode] = useState<Mode>("gross");
  const [raw, setRaw] = useState("");
  const [year, setYear] = useState(
    Math.min(LAST_YEAR, Math.max(FIRST_YEAR, defaultYear)),
  );

  // Solo digitos: "1.000.000" o "$ 1000000" valen igual.
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  const amount = digits === "" ? null : BigInt(digits);
  const result =
    amount === null
      ? null
      : mode === "gross"
        ? fromGross(amount, year)
        : fromNet(amount, year);

  const money = (value: bigint) => formatMoney(value, "CLP");

  return (
    <div className="flex max-w-xl flex-col gap-7">
      <section className="flex flex-col gap-4">
        <h2 className={labelClass}>Boleta de honorarios</h2>

        <div
          role="radiogroup"
          aria-label="Qué conoces"
          className="flex gap-5 font-mono text-[10.5px] uppercase"
        >
          {(
            [
              ["gross", "Tengo el monto bruto"],
              ["net", "Quiero recibir un líquido"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={
                mode === value
                  ? "border-foreground text-foreground border-b pb-0.5"
                  : "text-muted-foreground pb-0.5"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>
              {mode === "gross"
                ? "Monto bruto de la boleta"
                : "Líquido que quieres recibir"}
            </span>
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              autoComplete="off"
              className="border-input w-48 border-b bg-transparent py-1 font-mono text-[20px] outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Año de la boleta</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border-input bg-background border-b py-1.5 font-mono text-[14px] outline-none"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} · retención {formatRetention(y)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-live="polite" className="border-border border-t pt-4">
        {result === null ? (
          <p className="text-muted-foreground text-[15px] italic">
            Escribe un monto para ver el cálculo.
          </p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 font-mono text-[13px] tabular-nums">
            <dt className="font-serif text-[14.5px] italic">Monto bruto (boleta)</dt>
            <dd className="text-right">{money(result.grossMinor)}</dd>
            <dt className="font-serif text-[14.5px] italic">
              Retención {formatRetention(year)}
            </dt>
            <dd className="text-expense text-right">−{money(result.retentionMinor)}</dd>
            <dt className="border-border border-t pt-2 font-serif text-[14.5px] italic">
              Líquido que recibes
            </dt>
            <dd className="border-border border-t pt-2 text-right text-[16px]">
              {money(result.netMinor)}
            </dd>
          </dl>
        )}
      </section>

      <section className="text-muted-foreground flex flex-col gap-1.5 font-mono text-[10.5px]">
        <p>
          La retención de las boletas de honorarios sube cada año hasta llegar a 17% en
          2028 (Ley 21.133). Es un anticipo de impuestos: en la Operación Renta se ajusta
          contra el impuesto que realmente te corresponde, así que parte puede volver a ti
          como devolución.
        </p>
        <p>
          Es una ayuda para calcular, no asesoría tributaria: no considera PPM ni los
          casos en que la boleta no lleva retención.
        </p>
      </section>
    </div>
  );
}
