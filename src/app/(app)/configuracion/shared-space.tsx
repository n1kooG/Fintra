"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  inviteMember,
  leaveHousehold,
  removeHouseholdMember,
  revokeInvite,
  type InviteState,
} from "@/server/actions/household";
import type { SharedSpace } from "@/server/households/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatShortDay } from "@/lib/dates";

const rowClass =
  "border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-3";
const smallButton =
  "border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase disabled:opacity-50";

const initialInvite: InviteState = { error: null };

/** Espacio compartido: quienes estan, invitar por enlace y cancelar invitaciones. */
export function SharedSpaceSection({
  space,
  currentUserId,
}: {
  space: SharedSpace;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>, failure: string) {
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : failure);
      }
    });
  }

  return (
    <div>
      <div className="text-muted-foreground mb-2 flex items-baseline justify-between font-mono text-[10px] tracking-[0.12em] uppercase">
        <span>Espacio compartido</span>
        {space.isOwner ? <InviteDialog /> : null}
      </div>

      {space.members.map((member) => (
        <div key={member.userId} className={rowClass}>
          <div className="flex flex-col">
            <span className="text-[14.5px]">
              {member.displayName}
              {member.userId === currentUserId ? " (tú)" : ""}
            </span>
            {member.email ? (
              <span className="text-muted-foreground font-mono text-[11px]">
                {member.email}
              </span>
            ) : null}
          </div>
          <span className="flex items-baseline gap-4">
            <span className="text-muted-foreground font-mono text-[11px] uppercase">
              {member.role === "owner" ? "propietario" : "miembro"}
            </span>
            {space.isOwner && member.role !== "owner" ? (
              <button
                type="button"
                className={smallButton}
                disabled={pending}
                onClick={() => {
                  if (
                    !confirm(
                      `¿Sacar a ${member.displayName} del espacio? Conservará su cuenta, pero dejará de ver estos datos.`,
                    )
                  )
                    return;
                  run(
                    () => removeHouseholdMember(member.userId),
                    "No pudimos sacar a esa persona.",
                  );
                }}
              >
                sacar
              </button>
            ) : null}
            {member.userId === currentUserId && member.role !== "owner" ? (
              <button
                type="button"
                className={smallButton}
                disabled={pending}
                onClick={() => {
                  if (
                    !confirm(
                      "¿Salir de este espacio? Volverás a tener un espacio propio, vacío.",
                    )
                  )
                    return;
                  run(() => leaveHousehold(), "No pudimos sacarte del espacio.");
                }}
              >
                salir
              </button>
            ) : null}
          </span>
        </div>
      ))}

      {space.invitations.map((invitation) => (
        <div key={invitation.id} className={rowClass}>
          <div className="flex flex-col">
            <span className="text-[14.5px]">{invitation.email}</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {invitation.expired
                ? "invitación vencida"
                : `invitado · vence el ${formatShortDay(invitation.expiresAt.slice(0, 10))}`}
            </span>
          </div>
          <button
            type="button"
            className={smallButton}
            disabled={pending}
            onClick={() =>
              run(() => revokeInvite(invitation.id), "No pudimos cancelarla.")
            }
          >
            cancelar
          </button>
        </div>
      ))}

      {space.members.length === 1 && space.invitations.length === 0 ? (
        <p className="text-muted-foreground mt-2 font-mono text-[10.5px]">
          Hoy eres la única persona en este espacio. Invita a tu pareja o a quien comparta
          tus finanzas: verán los mismos datos y podrán cargar movimientos.
        </p>
      ) : null}
    </div>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(inviteMember, initialInvite);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No pudimos copiarlo: selecciónalo y cópialo a mano.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={smallButton}>
          + invitar
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Invitar a alguien</DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Escribe el correo de la persona. Te daremos un enlace para que se lo envíes
            (por WhatsApp, por ejemplo). Funciona solo con la cuenta de ese correo, una
            vez, y vence en 7 días. Verá todos los datos del espacio.
          </DialogDescription>
        </DialogHeader>

        {state.link ? (
          <div className="flex flex-col gap-3 pt-2">
            <Label
              htmlFor="invite-link"
              className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
            >
              Enlace de invitación
            </Label>
            <Input
              id="invite-link"
              readOnly
              value={state.link}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-[12px]"
            />
            <div className="flex gap-3">
              <Button
                onClick={() => copy(state.link!)}
                className="flex-1 py-3 text-[12.5px]"
              >
                Copiar enlace
              </Button>
              <Button asChild variant="outline" className="flex-1 py-3 text-[12.5px]">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Te invité a compartir mis finanzas en Fintra: ${state.link}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              </Button>
            </div>
            <p className="text-muted-foreground font-mono text-[10.5px]">
              Este enlace no se vuelve a mostrar. Si lo pierdes, cancela la invitación y
              crea otra.
            </p>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-5 pt-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-email"
                className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
              >
                Correo de la persona
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                maxLength={120}
              />
            </div>
            {state.error ? (
              <p role="alert" className="text-destructive font-mono text-[11px]">
                {state.error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={pending}
              className="w-full py-3 text-[12.5px]"
            >
              {pending ? "Creando..." : "Crear invitación"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
