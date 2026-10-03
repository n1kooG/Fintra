"use client";

import { FormDialog } from "@/components/form-dialog";
import {
  changePassword,
  deleteAccount,
  renameHousehold,
  requestEmailChange,
  updateProfileName,
} from "@/server/actions/profile";

const rowClass = "border-border flex items-center justify-between gap-3 border-b py-3";
const valueClass = "text-muted-foreground font-mono text-[12px]";

/** Perfil: nombre, correo, contrasena y nombre del espacio, cada uno con su dialogo. */
export function ProfileSection({
  displayName,
  email,
  householdName,
  isOwner,
  hasPassword,
}: {
  displayName: string;
  email: string;
  householdName: string;
  isOwner: boolean;
  hasPassword: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        Perfil
      </div>

      <div className={rowClass}>
        <span className="text-[14.5px]">Nombre</span>
        <span className="flex items-baseline gap-4">
          <span className={valueClass}>{displayName}</span>
          <FormDialog
            triggerLabel="cambiar"
            title="Cambiar nombre"
            fields={[
              {
                name: "name",
                label: "Nombre",
                defaultValue: displayName,
                maxLength: 80,
                autoComplete: "name",
              },
            ]}
            submitLabel="Guardar"
            action={updateProfileName}
            successMessage="Nombre actualizado."
          />
        </span>
      </div>

      <div className={rowClass}>
        <span className="text-[14.5px]">Correo</span>
        <span className="flex items-baseline gap-4">
          <span className={valueClass}>{email}</span>
          <FormDialog
            triggerLabel="cambiar"
            title="Cambiar correo"
            description="Te enviaremos un enlace de confirmación al correo nuevo. Hasta que lo abras, sigues entrando con el actual."
            fields={[
              {
                name: "email",
                label: "Correo nuevo",
                type: "email",
                autoComplete: "email",
                maxLength: 120,
              },
            ]}
            submitLabel="Enviar confirmación"
            action={requestEmailChange}
            successMessage="Revisa tu correo nuevo para confirmar el cambio."
          />
        </span>
      </div>

      <div className={rowClass}>
        <span className="text-[14.5px]">Contraseña</span>
        <FormDialog
          triggerLabel={hasPassword ? "cambiar" : "crear"}
          title={hasPassword ? "Cambiar contraseña" : "Crear una contraseña"}
          description={
            hasPassword
              ? undefined
              : "Hoy entras con Google. Con una contraseña también podrás entrar con tu correo."
          }
          fields={[
            ...(hasPassword
              ? [
                  {
                    name: "currentPassword",
                    label: "Contraseña actual",
                    type: "password" as const,
                    autoComplete: "current-password",
                  },
                ]
              : []),
            {
              name: "newPassword",
              label: "Contraseña nueva (mínimo 8)",
              type: "password",
              autoComplete: "new-password",
              maxLength: 72,
            },
            {
              name: "confirmPassword",
              label: "Repite la contraseña nueva",
              type: "password",
              autoComplete: "new-password",
              maxLength: 72,
            },
          ]}
          submitLabel="Guardar contraseña"
          action={changePassword}
          successMessage="Contraseña actualizada."
        />
      </div>

      <div className={rowClass}>
        <span className="text-[14.5px]">Espacio</span>
        <span className="flex items-baseline gap-4">
          <span className={valueClass}>{householdName}</span>
          {isOwner ? (
            <FormDialog
              triggerLabel="cambiar"
              title="Cambiar nombre del espacio"
              fields={[
                {
                  name: "name",
                  label: "Nombre del espacio",
                  defaultValue: householdName,
                  maxLength: 80,
                },
              ]}
              submitLabel="Guardar"
              action={renameHousehold}
              successMessage="Nombre del espacio actualizado."
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** Zona de peligro: eliminar la cuenta y los datos. */
export function DangerZone({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  return (
    <div>
      <div className="text-destructive mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        Zona de peligro
      </div>
      <div className={rowClass}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px]">Eliminar mi cuenta y mis datos</span>
          <span className="text-muted-foreground max-w-[380px] font-mono text-[10.5px]">
            Borra tu acceso y todo lo que cargaste. No se puede deshacer: descarga antes
            un respaldo.
          </span>
        </div>
        <FormDialog
          triggerLabel="eliminar"
          destructive
          title="Eliminar cuenta"
          description={`Se borrarán tu acceso y todos los datos del espacio. Para confirmar, escribe tu correo (${email})${hasPassword ? " y tu contraseña" : ""}.`}
          fields={[
            {
              name: "confirmEmail",
              label: "Tu correo",
              type: "email",
              autoComplete: "off",
              placeholder: email,
            },
            ...(hasPassword
              ? [
                  {
                    name: "password",
                    label: "Contraseña",
                    type: "password" as const,
                    autoComplete: "current-password",
                  },
                ]
              : []),
          ]}
          submitLabel="Eliminar todo definitivamente"
          action={deleteAccount}
        />
      </div>
    </div>
  );
}
