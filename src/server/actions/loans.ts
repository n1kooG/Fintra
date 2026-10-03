"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/auth/current-household";
import { CURRENCIES, toMinorUnits } from "@/lib/money";
import { amortizationSchedule, outstandingAt } from "@/lib/loans";
import { todayISO } from "@/lib/dates";
import { getLoans } from "@/server/queries/loans";
import type { ActionState } from "./accounts";

const amountField = (label: string) =>
  z.coerce
    .number()
    .positive(`${label} tiene que ser mayor a cero.`)
    .max(1_000_000_000_000, `${label} es demasiado grande.`);

const loanSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ponle un nombre al préstamo.")
    .max(80, "El nombre es muy largo."),
  lender: z.string().trim().max(80).optional(),
  principal: amountField("El monto del préstamo"),
  currency: z.enum(CURRENCIES),
  count: z.coerce
    .number()
    .int("La cantidad de cuotas tiene que ser un número entero.")
    .min(1, "Tiene que haber al menos 1 cuota.")
    .max(600, "Máximo 600 cuotas."),
  installment: amountField("El valor de la cuota"),
  firstDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de la primera cuota."),
});

function revalidateLoanViews() {
  revalidatePath("/tarjetas");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  revalidatePath("/cuentas");
}

/**
 * Registra un prestamo con lo que dice el contrato (monto, cuotas, valor
 * de la cuota, primera fecha). La tasa y la tabla de amortizacion se
 * derivan al leerlo; aca solo se comprueba que esos datos tengan solucion.
 */
export async function createLoan(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loanSchema.safeParse({
    name: formData.get("name"),
    lender: formData.get("lender") || undefined,
    principal: formData.get("principal"),
    currency: formData.get("currency"),
    count: formData.get("count"),
    installment: formData.get("installment"),
    firstDueDate: formData.get("firstDueDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del préstamo." };
  }

  const principalMinor = toMinorUnits(parsed.data.principal, parsed.data.currency);
  const installmentMinor = toMinorUnits(parsed.data.installment, parsed.data.currency);
  if (principalMinor <= 0n || installmentMinor <= 0n) {
    return { error: "Los montos son demasiado pequeños." };
  }

  const schedule = amortizationSchedule({
    principalMinor,
    installmentMinor,
    count: parsed.data.count,
    firstDueDate: parsed.data.firstDueDate,
  });
  if (!schedule) {
    return {
      error:
        "Con ese monto, número de cuotas y valor de cuota las cuentas no cuadran: las cuotas no alcanzan a pagar el préstamo. Revisa los datos.",
    };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("loans").insert({
    household_id: householdId,
    name: parsed.data.name,
    lender: parsed.data.lender ?? null,
    principal_minor: principalMinor.toString(),
    currency: parsed.data.currency,
    installments_count: parsed.data.count,
    installment_minor: installmentMinor.toString(),
    first_due_date: parsed.data.firstDueDate,
  });
  if (error) return { error: "No pudimos guardar el préstamo. Intenta de nuevo." };

  revalidateLoanViews();
  return { error: null };
}

export async function deleteLoan(loanId: string) {
  if (!z.string().uuid().safeParse(loanId).success) throw new Error("Préstamo inválido.");

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("loans")
    .delete()
    .eq("id", loanId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el préstamo.");

  revalidateLoanViews();
}

const loanId = z.string().uuid("Préstamo inválido.");

/**
 * Edita lo que dice el contrato (nombre, institucion, monto, cuotas, valor de
 * la cuota, primera fecha). La moneda no cambia: invalidaria los abonos y todo
 * lo calculado. Los abonos ya registrados se conservan.
 */
export async function updateLoan(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!loanId.safeParse(id).success) return { error: "Préstamo inválido." };
  const parsed = loanSchema.omit({ currency: true }).safeParse({
    name: formData.get("name"),
    lender: formData.get("lender") || undefined,
    principal: formData.get("principal"),
    count: formData.get("count"),
    installment: formData.get("installment"),
    firstDueDate: formData.get("firstDueDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del préstamo." };
  }

  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("loans")
    .select("currency")
    .eq("id", id)
    .eq("household_id", householdId)
    .single();
  if (!current) return { error: "No encontramos el préstamo." };

  const currency = current.currency as (typeof CURRENCIES)[number];
  const principalMinor = toMinorUnits(parsed.data.principal, currency);
  const installmentMinor = toMinorUnits(parsed.data.installment, currency);
  if (principalMinor <= 0n || installmentMinor <= 0n) {
    return { error: "Los montos son demasiado pequeños." };
  }
  const schedule = amortizationSchedule({
    principalMinor,
    installmentMinor,
    count: parsed.data.count,
    firstDueDate: parsed.data.firstDueDate,
  });
  if (!schedule) {
    return {
      error:
        "Con ese monto, número de cuotas y valor de cuota las cuentas no cuadran: las cuotas no alcanzan a pagar el préstamo. Revisa los datos.",
    };
  }

  const { error } = await supabase
    .from("loans")
    .update({
      name: parsed.data.name,
      lender: parsed.data.lender ?? null,
      principal_minor: principalMinor.toString(),
      installments_count: parsed.data.count,
      installment_minor: installmentMinor.toString(),
      first_due_date: parsed.data.firstDueDate,
    })
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) return { error: "No pudimos guardar los cambios. Intenta de nuevo." };

  revalidateLoanViews();
  return { error: null };
}

const prepaymentSchema = z.object({
  amount: amountField("El abono"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  mode: z.enum(["shorten_term", "reduce_installment"]),
  note: z.string().trim().max(120).optional(),
  accountId: z.string().uuid().optional(),
});

/**
 * Registra un abono extraordinario al capital. Si se indica una cuenta (de
 * la misma moneda del prestamo), tambien se descuenta de ella como un gasto:
 * sin eso el patrimonio subiria artificialmente (baja la deuda pero no la plata).
 */
export async function addLoanPrepayment(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!loanId.safeParse(id).success) return { error: "Préstamo inválido." };
  const parsed = prepaymentSchema.safeParse({
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn") || todayISO(),
    mode: formData.get("mode") || "shorten_term",
    note: formData.get("note") || undefined,
    accountId: formData.get("accountId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del abono." };
  }

  const { householdId, userId } = await requireCurrentHousehold();
  const loan = (await getLoans(householdId)).find((l) => l.id === id);
  if (!loan) return { error: "No encontramos el préstamo." };

  const amountMinor = toMinorUnits(parsed.data.amount, loan.currency);
  if (amountMinor <= 0n) return { error: "El abono es demasiado pequeño." };
  const owed = outstandingAt(
    loan.principalMinor,
    loan.rows,
    parsed.data.paidOn,
    loan.prepayments,
  );
  if (owed <= 0n) return { error: "Este préstamo ya está pagado en esa fecha." };
  if (amountMinor > owed) {
    return { error: "El abono es mayor que el capital que debes en esa fecha." };
  }

  const supabase = await createClient();

  let accountCurrency: string | null = null;
  if (parsed.data.accountId) {
    const { data: account } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", parsed.data.accountId)
      .eq("household_id", householdId)
      .single();
    if (!account) return { error: "No encontramos la cuenta elegida." };
    accountCurrency = account.currency;
    if (account.currency !== loan.currency) {
      return { error: "La cuenta debe estar en la misma moneda que el préstamo." };
    }
  }

  const { data: prepayment, error } = await supabase
    .from("loan_prepayments")
    .insert({
      household_id: householdId,
      loan_id: id,
      paid_on: parsed.data.paidOn,
      amount_minor: amountMinor.toString(),
      mode: parsed.data.mode,
      note: parsed.data.note ?? null,
    })
    .select("id")
    .single();
  if (error || !prepayment)
    return { error: "No pudimos guardar el abono. Intenta de nuevo." };

  if (parsed.data.accountId && accountCurrency) {
    const { error: txError } = await supabase.from("transactions").insert({
      household_id: householdId,
      account_id: parsed.data.accountId,
      category_id: null,
      type: "expense",
      amount_minor: (-amountMinor).toString(),
      currency: loan.currency,
      fx_rate: null,
      occurred_on: parsed.data.paidOn,
      merchant: `Abono extraordinario ${loan.name}`,
      notes: parsed.data.note ?? null,
      created_by: userId,
    });
    if (txError) {
      // Sin el gasto el abono quedaria a medias: se revierte.
      await supabase.from("loan_prepayments").delete().eq("id", prepayment.id);
      return { error: "No pudimos descontarlo de la cuenta. No se registró el abono." };
    }
    revalidatePath("/movimientos");
  }

  revalidateLoanViews();
  return { error: null };
}

export async function deleteLoanPrepayment(prepaymentId: string) {
  if (!z.string().uuid().safeParse(prepaymentId).success) {
    throw new Error("Abono inválido.");
  }
  const { householdId } = await requireCurrentHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("loan_prepayments")
    .delete()
    .eq("id", prepaymentId)
    .eq("household_id", householdId);
  if (error) throw new Error("No pudimos eliminar el abono.");

  revalidateLoanViews();
}
