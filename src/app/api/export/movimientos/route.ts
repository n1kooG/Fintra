import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { createClient } from "@/lib/supabase/server";
import { csvRaw, csvText, formatDecimalComma, toCsv } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { XLSX_CONTENT_TYPE, buildXlsx, date, money, text } from "@/lib/xlsx";
import type { Currency } from "@/lib/money";
import { fetchAll } from "@/server/queries/paginate";
import { getCategoryLabelMap } from "@/server/queries/categories";

const TYPE_LABEL: Record<string, string> = {
  income: "ingreso",
  expense: "gasto",
  transfer: "transferencia",
};

/** "yyyy-mm-dd" real (no acepta 2026-02-31), o null. */
function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

/**
 * Exporta los movimientos a CSV (UTF-8 con BOM, separador ";" y decimal
 * con coma: abre bien en Excel con configuracion de Chile). Filtros
 * opcionales ?desde= y ?hasta= (yyyy-mm-dd). Requiere sesion; RLS y el
 * filtro por household_id acotan los datos a los del usuario.
 */
export async function GET(request: Request) {
  const current = await getCurrentHousehold();
  if (!current) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("desde"));
  const to = parseDate(params.get("hasta"));
  if ((params.get("desde") && !from) || (params.get("hasta") && !to)) {
    return NextResponse.json(
      { error: "Fecha inválida (usa yyyy-mm-dd)." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const rows = await fetchAll<{
    occurred_on: string;
    type: string;
    amount_minor: string;
    currency: Currency;
    merchant: string | null;
    notes: string | null;
    recurring_rule_id: string | null;
    category_id: string | null;
    account: { name: string } | null;
    category: { name: string } | null;
    transaction_tags: { tag: { name: string } | null }[];
  }>((start, end) => {
    let query = supabase
      .from("transactions")
      .select(
        "occurred_on, type, amount_minor, currency, merchant, notes, recurring_rule_id, category_id, account:accounts(name), category:categories(name), transaction_tags(tag:tags(name))",
      )
      .eq("household_id", current.householdId);
    if (from) query = query.gte("occurred_on", from);
    if (to) query = query.lte("occurred_on", to);
    return query.order("occurred_on", { ascending: false }).order("id").range(start, end);
  });

  const labels = await getCategoryLabelMap(current.householdId);
  const categoryName = (tx: (typeof rows)[number]) =>
    (tx.category_id && labels.get(tx.category_id)) || tx.category?.name;
  const tagsOf = (tx: (typeof rows)[number]) =>
    tx.transaction_tags.flatMap((l) => (l.tag ? [l.tag.name] : [])).join(" | ");

  // ?formato=xlsx: planilla de Excel con fechas y montos reales (no texto).
  if (params.get("formato") === "xlsx") {
    const bytes = buildXlsx({
      name: "Movimientos",
      columns: [
        { header: "Fecha", width: 12 },
        { header: "Tipo", width: 14 },
        { header: "Cuenta", width: 22 },
        { header: "Categoría", width: 24 },
        { header: "Comercio", width: 28 },
        { header: "Nota", width: 30 },
        { header: "Etiquetas", width: 22 },
        { header: "Moneda", width: 9 },
        { header: "Monto", width: 14 },
        { header: "Recurrente", width: 11 },
      ],
      rows: rows.map((tx) => [
        date(tx.occurred_on),
        text(TYPE_LABEL[tx.type] ?? tx.type),
        text(tx.account?.name),
        text(categoryName(tx)),
        text(tx.merchant),
        text(tx.notes),
        text(tagsOf(tx)),
        text(tx.currency),
        money(BigInt(tx.amount_minor), tx.currency),
        text(tx.recurring_rule_id ? "sí" : "no"),
      ]),
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="fintra-movimientos-${todayISO()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const header = [
    "fecha",
    "tipo",
    "cuenta",
    "categoria",
    "comercio",
    "nota",
    "etiquetas",
    "moneda",
    "monto",
    "monto_unidad_minima",
    "recurrente",
  ];
  const lines = rows.map((tx) => {
    const amountMinor = BigInt(tx.amount_minor);
    return [
      csvRaw(tx.occurred_on),
      csvRaw(TYPE_LABEL[tx.type] ?? tx.type),
      csvText(tx.account?.name),
      csvText(categoryName(tx)),
      csvText(tx.merchant),
      csvText(tx.notes),
      csvText(tagsOf(tx)),
      csvRaw(tx.currency),
      csvRaw(formatDecimalComma(amountMinor, tx.currency)),
      csvRaw(amountMinor.toString()),
      csvRaw(tx.recurring_rule_id ? "si" : "no"),
    ];
  });

  // BOM: sin el, Excel abre el archivo como ANSI y rompe tildes y la ñ.
  const body = `﻿${toCsv([header, ...lines])}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fintra-movimientos-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
