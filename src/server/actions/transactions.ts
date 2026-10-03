"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { toMinorUnits, type Currency } from "@/lib/money";
import { FREQUENCIES, nextOccurrenceAfter } from "@/lib/recurrence";
import { firstInstallmentDueDate } from "@/lib/cards";
import { todayISO } from "@/lib/dates";
import { parseTagNames } from "@/lib/tags";
import { setTransactionTags } from "@/server/tags";
import { createTransfer } from "@/server/transfers";
import { checkSnapshot, referencedIds, type DeletedSnapshot } from "@/lib/undo";
import { rateToFreeze } from "@/server/fx/rates";
import { materializeDueRecurring } from "@/server/recurring/materialize";
import type { ActionState } from "./accounts";

const baseFields = {
  amount: z.coerce.number().positive("El monto tiene que ser mayor a cero."),
  occurredOn: z.string().min(1).default(todayISO),
  merchant: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
};

const incomeOrExpenseSchema = z.object({
  type: z.enum(["income", "expense"]),
  accountId: z.string().uuid("Elige una cuenta."),
  categoryId: z.string().uuid("Elige una categoría."),
  ...baseFields,
});

const repeatSchema = z.enum(FREQUENCIES).optional();
const installmentsSchema = z.coerce.number().int().min(2).max(60).optional();

const transferSchema = z.object({
  type: z.literal("transfer"),
  fromAccountId: z.string().uuid("Elige la cuenta de origen."),
  toAccountId: z.string().uuid("Elige la cuenta de destino."),
  // Solo entre monedas distintas: cuanto llego a la cuenta de destino,
  // en SU moneda. Si se deja vacio se calcula con la cotizacion del dia.
  receivedAmount: z.coerce
    .number()
    .positive("El monto recibido tiene que ser mayor a cero.")
    .optional(),
  ...baseFields,
});

function revalidateMovementViews() {
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/recurrentes");
  revalidatePath("/tarjetas");
  revalidatePath("/calendario");
}

/**
 * Crea un movimiento de ingreso, gasto o transferencia. El signo del
 * monto se decide aca, nunca en el formulario: ingreso y entrada de
 * transferencia quedan positivos, gasto y salida de transferencia
 * quedan negativos — asi el saldo de una cuenta es simplemente
 * `saldo_inicial + suma(amount_minor)`, sin tener que ramificar por
 * tipo en cada lectura.
 *
 * Todo movimiento en moneda distinta a CLP guarda la cotizacion de su
 * fecha (fx_rate), para que los reportes historicos no cambien cuando
 * cambie el dolar.
 */
export async function createTransaction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const type = String(formData.get("type") ?? "");
  const { householdId, userId } = await requireCurrentHousehold();
  const supabase = await createClient();

  if (type === "transfer") {
    const parsed = transferSchema.safeParse({
      type: "transfer",
      fromAccountId: formData.get("fromAccountId"),
      toAccountId: formData.get("toAccountId"),
      receivedAmount: formData.get("receivedAmount") || undefined,
      amount: formData.get("amount"),
      occurredOn: formData.get("occurredOn") || todayISO(),
      merchant: formData.get("merchant") || undefined,
      notes: formData.get("notes") || undefined,
    });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Revisa los datos de la transferencia.",
      };
    }
    const created = await createTransfer(supabase, {
      householdId,
      userId,
      fromAccountId: parsed.data.fromAccountId,
      toAccountId: parsed.data.toAccountId,
      amount: parsed.data.amount,
      receivedAmount: parsed.data.receivedAmount,
      occurredOn: parsed.data.occurredOn,
      merchant: parsed.data.merchant,
      notes: parsed.data.notes,
    });
    if (created.error) return { error: created.error };
  } else {
    const parsed = incomeOrExpenseSchema.safeParse({
      type,
      accountId: formData.get("accountId"),
      categoryId: formData.get("categoryId"),
      amount: formData.get("amount"),
      occurredOn: formData.get("occurredOn") || todayISO(),
      merchant: formData.get("merchant") || undefined,
      notes: formData.get("notes") || undefined,
    });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Revisa los datos del movimiento.",
      };
    }
    const repeat = repeatSchema.safeParse(formData.get("repeat") || undefined);
    if (!repeat.success) return { error: "Frecuencia de repetición inválida." };
    const installments = installmentsSchema.safeParse(
      formData.get("installments") || undefined,
    );
    if (!installments.success) return { error: "La cantidad de cuotas es inválida." };
    if (installments.data && parsed.data.type !== "expense") {
      return { error: "Solo los gastos se pueden pagar en cuotas." };
    }
    if (installments.data && repeat.data) {
      return { error: "Una compra en cuotas no se puede repetir." };
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("id, currency, type, statement_close_day, payment_due_day")
      .eq("id", parsed.data.accountId)
      .eq("household_id", householdId)
      .single();
    if (!account) return { error: "No encontramos la cuenta elegida." };
    if (
      installments.data &&
      (account.type !== "credit_card" ||
        account.statement_close_day === null ||
        account.payment_due_day === null)
    ) {
      return {
        error:
          "Para pagar en cuotas elige una tarjeta de crédito con el día de cierre y de pago configurados (en Tarjetas).",
      };
    }

    const currency = account.currency as Currency;
    const magnitude = toMinorUnits(parsed.data.amount, currency);
    const amountMinor = parsed.data.type === "expense" ? -magnitude : magnitude;

    // "Repetir": la regla nace con este movimiento como primera ocurrencia
    // y la siguiente queda programada; el motor genera el resto.
    let recurringRuleId: string | null = null;
    if (repeat.data) {
      const schedule = {
        startDate: parsed.data.occurredOn,
        frequency: repeat.data,
        endDate: null,
      };
      const { data: rule, error: ruleError } = await supabase
        .from("recurring_rules")
        .insert({
          household_id: householdId,
          type: parsed.data.type,
          account_id: account.id,
          category_id: parsed.data.categoryId,
          amount_minor: magnitude.toString(),
          currency,
          merchant: parsed.data.merchant ?? null,
          notes: parsed.data.notes ?? null,
          frequency: repeat.data,
          start_date: parsed.data.occurredOn,
          next_run_on: nextOccurrenceAfter(schedule, parsed.data.occurredOn)!,
          created_by: userId,
        })
        .select("id")
        .single();
      if (ruleError || !rule) return { error: "No pudimos crear la repetición." };
      recurringRuleId = rule.id;
    }

    const { data: created, error } = await supabase
      .from("transactions")
      .insert({
        household_id: householdId,
        account_id: account.id,
        category_id: parsed.data.categoryId,
        type: parsed.data.type,
        amount_minor: amountMinor.toString(),
        currency,
        fx_rate: await rateToFreeze(supabase, currency, parsed.data.occurredOn),
        occurred_on: parsed.data.occurredOn,
        merchant: parsed.data.merchant ?? null,
        notes: parsed.data.notes ?? null,
        recurring_rule_id: recurringRuleId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !created) {
      if (recurringRuleId) {
        await supabase.from("recurring_rules").delete().eq("id", recurringRuleId);
      }
      return { error: "No pudimos guardar el movimiento. Inténtalo de nuevo." };
    }

    // Compra en cuotas: la compra queda UNA vez por el total; el plan dice
    // como se factura (ver src/lib/cards.ts).
    if (installments.data) {
      const { error: planError } = await supabase.from("installment_plans").insert({
        household_id: householdId,
        account_id: account.id,
        transaction_id: created.id,
        installments_count: installments.data,
        total_minor: magnitude.toString(),
        first_due_date: firstInstallmentDueDate(
          parsed.data.occurredOn,
          account.statement_close_day,
          account.payment_due_day,
        ),
        due_day: account.payment_due_day,
      });
      if (planError) {
        // Sin plan la compra quedaria como un gasto al contado: se revierte.
        await supabase.from("transactions").delete().eq("id", created.id);
        return { error: "No pudimos registrar las cuotas. Intenta de nuevo." };
      }
    }

    // Las etiquetas son secundarias: si fallan, el movimiento ya esta guardado
    // y no se debe duplicar reintentando el formulario.
    const tagNames = parseTagNames(String(formData.get("tags") ?? ""));
    if (tagNames.length > 0) {
      const ok = await setTransactionTags(supabase, householdId, created.id, tagNames);
      if (!ok)
        console.error("No se pudieron guardar las etiquetas del movimiento", created.id);
    }

    // Si el primer movimiento tiene fecha pasada, puede haber ocurrencias
    // intermedias ya vencidas: se generan ahora y no al dia siguiente.
    if (recurringRuleId) await materializeDueRecurring(supabase, householdId);
  }

  revalidateMovementViews();
  redirect("/movimientos");
}

/**
 * Edita un movimiento de ingreso o gasto (cuenta, categoria, monto,
 * fecha, comercio, nota). Las transferencias no se editan aca: al ser
 * dos movimientos enlazados, cambiar el monto o la cuenta de un lado
 * dejaria el otro lado inconsistente — se eliminan y se cargan de
 * nuevo.
 */
export async function updateTransaction(
  transactionId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = incomeOrExpenseSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn") || todayISO(),
    merchant: formData.get("merchant") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa los datos del movimiento.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency")
    .eq("id", parsed.data.accountId)
    .eq("household_id", householdId)
    .single();
  if (!account) return { error: "No encontramos la cuenta elegida." };

  const currency = account.currency as Currency;
  const magnitude = toMinorUnits(parsed.data.amount, currency);
  const amountMinor = parsed.data.type === "expense" ? -magnitude : magnitude;

  // Una compra en cuotas tiene su plan atado al monto, la cuenta y la fecha:
  // cambiarlos lo dejaria desfasado. Categoria, comercio y nota si se editan.
  const { data: plan } = await supabase
    .from("installment_plans")
    .select("account_id, total_minor, transaction:transactions(occurred_on)")
    .eq("transaction_id", transactionId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (plan) {
    const originalDate = (plan.transaction as unknown as { occurred_on: string } | null)
      ?.occurred_on;
    if (
      plan.account_id !== account.id ||
      BigInt(plan.total_minor) !== magnitude ||
      originalDate !== parsed.data.occurredOn
    ) {
      return {
        error:
          "Esta compra está en cuotas: para cambiar el monto, la cuenta o la fecha, elimínala y vuelve a cargarla.",
      };
    }
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      account_id: account.id,
      category_id: parsed.data.categoryId,
      type: parsed.data.type,
      amount_minor: amountMinor.toString(),
      currency,
      // La fecha o la cuenta (y con ella la moneda) pueden haber cambiado.
      fx_rate: await rateToFreeze(supabase, currency, parsed.data.occurredOn),
      occurred_on: parsed.data.occurredOn,
      merchant: parsed.data.merchant ?? null,
      notes: parsed.data.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("household_id", householdId)
    .neq("type", "transfer"); // resguardo: nunca reescribe una pierna de transferencia

  if (error) return { error: "No pudimos guardar los cambios. Inténtalo de nuevo." };

  // Solo si el formulario trae el campo: asi un envio sin etiquetas no las borra.
  if (formData.has("tags")) {
    const ok = await setTransactionTags(
      supabase,
      householdId,
      transactionId,
      parseTagNames(String(formData.get("tags") ?? "")),
    );
    if (!ok)
      return {
        error: "Guardamos los cambios, pero no las etiquetas. Inténtalo de nuevo.",
      };
  }

  revalidateMovementViews();
  redirect("/movimientos");
}

const idList = z.array(z.string().uuid()).min(1).max(200);

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Copia de lo que se va a borrar, para poder deshacerlo: los movimientos (con
 * la otra pierna si son una transferencia), el enlace de la transferencia, el
 * plan de cuotas y las etiquetas. Ver src/lib/undo.ts.
 */
async function collectSnapshot(
  supabase: Supabase,
  householdId: string,
  ids: string[],
): Promise<DeletedSnapshot | null> {
  // Los ids son uuid ya validados: se pueden interpolar en un filtro .or().
  const { data: links } = await supabase
    .from("transfers")
    .select("id, from_transaction_id, to_transaction_id")
    .eq("household_id", householdId)
    .or(
      ids
        .map((id) => `from_transaction_id.eq.${id},to_transaction_id.eq.${id}`)
        .join(","),
    );

  const allIds = [
    ...new Set([
      ...ids,
      ...(links ?? []).flatMap((l) => [l.from_transaction_id, l.to_transaction_id]),
    ]),
  ];

  const [txs, plans, tagLinks] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, account_id, category_id, type, amount_minor, currency, fx_rate, occurred_on, merchant, notes, recurring_rule_id, created_at",
      )
      .eq("household_id", householdId)
      .in("id", allIds),
    supabase
      .from("installment_plans")
      .select(
        "id, account_id, transaction_id, installments_count, total_minor, first_due_date, due_day",
      )
      .eq("household_id", householdId)
      .in("transaction_id", allIds),
    supabase
      .from("transaction_tags")
      .select("transaction_id, tag_id")
      .in("transaction_id", allIds),
  ]);
  if (txs.error || !txs.data || txs.data.length === 0) return null;

  // PostgREST puede devolver bigint y numeric como numeros: se normalizan a texto.
  const candidate = {
    transactions: txs.data.map((t) => ({
      ...t,
      amount_minor: String(t.amount_minor),
      fx_rate: t.fx_rate == null ? null : String(t.fx_rate),
    })),
    transfers: (links ?? []).map((l) => ({
      id: l.id,
      from_transaction_id: l.from_transaction_id,
      to_transaction_id: l.to_transaction_id,
    })),
    plans: (plans.data ?? []).map((p) => ({ ...p, total_minor: String(p.total_minor) })),
    tagLinks: tagLinks.data ?? [],
  };
  const checked = checkSnapshot(candidate);
  return checked.ok ? checked.snapshot : null;
}

async function deleteWithSnapshot(ids: string[]): Promise<DeletedSnapshot | null> {
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const snapshot = await collectSnapshot(supabase, householdId, ids);
  if (!snapshot) throw new Error("No encontramos el movimiento.");

  // Borrar los movimientos arrastra por cascada transferencias, planes y etiquetas.
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in(
      "id",
      snapshot.transactions.map((t) => t.id),
    )
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el movimiento.");

  revalidateMovementViews();
  return snapshot;
}

/**
 * Elimina un movimiento y devuelve una copia para «Deshacer». Si es parte de
 * una transferencia se borra la otra pierna tambien — de lo contrario quedaria
 * un movimiento "huerfano" en la otra cuenta, sin su contraparte.
 */
export async function deleteTransaction(
  transactionId: string,
): Promise<DeletedSnapshot | null> {
  if (!z.string().uuid().safeParse(transactionId).success) {
    throw new Error("Movimiento inválido.");
  }
  return deleteWithSnapshot([transactionId]);
}

/** Elimina varios movimientos a la vez (seleccion en lote) y devuelve la copia para deshacer. */
export async function deleteTransactions(
  transactionIds: string[],
): Promise<DeletedSnapshot | null> {
  const ids = idList.safeParse(transactionIds);
  if (!ids.success) throw new Error("Selección inválida.");
  return deleteWithSnapshot(ids.data);
}

/**
 * Vuelve a crear lo que se elimino, con los mismos ids. La copia viaja por el
 * cliente, asi que se valida de forma estricta, el hogar y el autor los pone
 * el servidor, y las cuentas y categorias a las que apunta deben ser del hogar.
 */
export async function restoreDeleted(input: unknown): Promise<{ error: string | null }> {
  const checked = checkSnapshot(input);
  if (!checked.ok) return { error: checked.error };
  const { snapshot } = checked;

  const { householdId, userId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const refs = referencedIds(snapshot);
  const [accounts, categories, rules] = await Promise.all([
    supabase
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .in("id", refs.accounts),
    refs.categories.length > 0
      ? supabase
          .from("categories")
          .select("id")
          .eq("household_id", householdId)
          .in("id", refs.categories)
      : Promise.resolve({ data: [] as { id: string }[] }),
    refs.rules.length > 0
      ? supabase
          .from("recurring_rules")
          .select("id")
          .eq("household_id", householdId)
          .in("id", refs.rules)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  if (
    (accounts.data?.length ?? 0) !== refs.accounts.length ||
    (categories.data?.length ?? 0) !== refs.categories.length ||
    (rules.data?.length ?? 0) !== refs.rules.length
  ) {
    return { error: "Ya no existen la cuenta o la categoría de ese movimiento." };
  }

  const { error: txError } = await supabase.from("transactions").insert(
    snapshot.transactions.map((t) => ({
      ...t,
      household_id: householdId,
      created_by: userId,
    })),
  );
  if (txError) return { error: "No pudimos deshacer la eliminación." };

  const rollback = async () => {
    await supabase
      .from("transactions")
      .delete()
      .in(
        "id",
        snapshot.transactions.map((t) => t.id),
      )
      .eq("household_id", householdId);
  };

  if (snapshot.plans.length > 0) {
    const { error } = await supabase
      .from("installment_plans")
      .insert(snapshot.plans.map((p) => ({ ...p, household_id: householdId })));
    if (error) {
      await rollback();
      return { error: "No pudimos deshacer la eliminación." };
    }
  }
  if (snapshot.transfers.length > 0) {
    const { error } = await supabase
      .from("transfers")
      .insert(snapshot.transfers.map((t) => ({ ...t, household_id: householdId })));
    if (error) {
      await rollback();
      return { error: "No pudimos deshacer la eliminación." };
    }
  }
  if (snapshot.tagLinks.length > 0) {
    // Una etiqueta borrada entretanto no debe impedir deshacer: se omiten esas.
    const { data: tags } = await supabase
      .from("tags")
      .select("id")
      .eq("household_id", householdId)
      .in("id", [...new Set(snapshot.tagLinks.map((l) => l.tag_id))]);
    const alive = new Set((tags ?? []).map((t) => t.id));
    const links = snapshot.tagLinks.filter((l) => alive.has(l.tag_id));
    if (links.length > 0) await supabase.from("transaction_tags").insert(links);
  }

  revalidateMovementViews();
  return { error: null };
}

/**
 * Cambia la categoria de varios movimientos a la vez. Solo ingresos y gastos
 * (las transferencias no tienen categoria) y de ese mismo tipo: una categoria
 * de gasto no se asigna a un ingreso.
 */
export async function recategorizeTransactions(
  transactionIds: string[],
  categoryId: string,
): Promise<{ updated: number; error: string | null }> {
  const ids = idList.safeParse(transactionIds);
  if (!ids.success || !z.string().uuid().safeParse(categoryId).success) {
    return { updated: 0, error: "Selección inválida." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, kind")
    .eq("id", categoryId)
    .eq("household_id", householdId)
    .single();
  if (!category) return { updated: 0, error: "No encontramos la categoría." };

  const { data, error } = await supabase
    .from("transactions")
    .update({ category_id: category.id, updated_at: new Date().toISOString() })
    .in("id", ids.data)
    .eq("household_id", householdId)
    .eq("type", category.kind)
    .select("id");
  if (error) return { updated: 0, error: "No pudimos cambiar la categoría." };

  revalidateMovementViews();
  return { updated: data?.length ?? 0, error: null };
}
