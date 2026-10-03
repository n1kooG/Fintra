import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { isSameOrigin } from "@/lib/origin";
import { parseBackup, prepareRestore } from "@/lib/backup";
import { restoreIntoHousehold } from "@/server/backup/restore";

/** Un respaldo personal real pesa unos pocos MB; esto es solo un tope de cordura. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Lo que hay que escribir para confirmar que se reemplazan los datos actuales. */
export const RESTORE_CONFIRMATION = "REEMPLAZAR";

/**
 * Restaura un respaldo JSON de Fintra REEMPLAZANDO todos los datos del
 * hogar (ver src/lib/backup.ts y src/server/backup/restore.ts). Es atomico:
 * si algo falla, no cambia nada. Requiere sesion, mismo origen y la frase
 * de confirmacion.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const current = await getCurrentHousehold();
  if (!current) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No pudimos leer el archivo." }, { status: 400 });
  }

  if (String(form.get("confirmation") ?? "").trim() !== RESTORE_CONFIRMATION) {
    return NextResponse.json(
      { error: `Escribe ${RESTORE_CONFIRMATION} para confirmar.` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Elige un archivo de respaldo." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo es demasiado grande." },
      { status: 413 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return NextResponse.json(
      { error: "El archivo no es un JSON válido." },
      { status: 400 },
    );
  }

  const parsed = parseBackup(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const prepared = prepareRestore(parsed.backup, {
    userId: current.userId,
    householdId: current.householdId,
  });

  try {
    await restoreIntoHousehold(
      prepared,
      current.householdId,
      parsed.backup.profile?.displayCurrency,
      current.userId,
    );
  } catch (error) {
    console.error("Fallo al restaurar el respaldo", error);
    return NextResponse.json(
      { error: "No pudimos restaurar el respaldo. No se cambió nada." },
      { status: 500 },
    );
  }

  revalidatePath("/", "layout");
  return NextResponse.json({
    ok: true,
    counts: prepared.counts,
    dropped: prepared.dropped,
  });
}
