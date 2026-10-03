import Link from "next/link";
import { redirect } from "next/navigation";
import { sqlClient } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { emailsMatch, INVITE_ERROR } from "@/lib/invitations";
import { getInvitationPreview } from "@/server/households/queries";
import { signOutTo } from "@/app/(auth)/actions";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Invitación" };

export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const current = await getCurrentHousehold();
  if (!current) redirect(`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const preview = await getInvitationPreview(token);

  if (!preview) return <Notice title="Enlace no válido" body={INVITE_ERROR.invalid} />;
  if (preview.state === "accepted") {
    return <Notice title="Invitación usada" body={INVITE_ERROR.accepted} />;
  }
  if (preview.state === "expired") {
    return <Notice title="Invitación vencida" body={INVITE_ERROR.expired} />;
  }

  if (!emailsMatch(preview.email, user?.email)) {
    return (
      <Notice
        title="Esta invitación es para otra cuenta"
        body={`Está dirigida a ${preview.email}, pero entraste como ${user?.email ?? "otra cuenta"}.`}
      >
        <form action={signOutTo.bind(null, `/invitacion/${token}`)}>
          <button
            type="submit"
            className="border-foreground border-b pb-0.5 font-mono text-[11px] uppercase"
          >
            Cambiar de cuenta
          </button>
        </form>
      </Notice>
    );
  }

  // Lo que se descarta al unirse: el espacio personal actual (si no tiene movimientos).
  const [mine] = await sqlClient<{ accounts: number; transactions: number }[]>`
    select
      (select count(*)::int from accounts where household_id = ${current.householdId}) as accounts,
      (select count(*)::int from transactions where household_id = ${current.householdId}) as transactions`;

  if (mine.transactions > 0) {
    return <Notice title="No podemos unir tus datos" body={INVITE_ERROR.hasData} />;
  }

  return (
    <div>
      <p className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
        Invitación
      </p>
      <h1 className="mb-3 text-[26px] font-medium">
        {preview.inviterName} te invitó a compartir «{preview.householdName}»
      </h1>
      <p className="text-muted-foreground mb-6 text-[14.5px]">
        Verás las mismas cuentas, movimientos, presupuestos y metas que esa persona, y
        podrás cargar y editar movimientos. Ella podrá sacarte del espacio cuando quiera.
      </p>
      {mine.accounts > 0 ? (
        <p className="border-border text-muted-foreground mb-6 border-l-2 pl-3 text-[13.5px]">
          Tu espacio personal actual ({mine.accounts}{" "}
          {mine.accounts === 1 ? "cuenta" : "cuentas"}, sin movimientos) se eliminará al
          unirte.
        </p>
      ) : null}
      <AcceptForm token={token} />
      <p className="mt-6 text-center">
        <Link
          href="/dashboard"
          className="text-muted-foreground font-mono text-[10.5px] uppercase underline underline-offset-4"
        >
          Ahora no
        </Link>
      </p>
    </div>
  );
}

function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[24px] font-medium">{title}</h1>
      <p className="text-muted-foreground text-[14.5px]">{body}</p>
      {children}
      <Link
        href="/dashboard"
        className="text-muted-foreground font-mono text-[10.5px] uppercase underline underline-offset-4"
      >
        Ir a mi cuenta
      </Link>
    </div>
  );
}
