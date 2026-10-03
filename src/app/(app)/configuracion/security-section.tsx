"use client";

import { useState, useTransition } from "react";
import {
  confirmMfaEnrollment,
  disableMfa,
  startMfaEnrollment,
} from "@/server/actions/mfa";

const buttonClass =
  "border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase disabled:opacity-50";
const rowClass =
  "border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-3";
const inputClass =
  "border-input bg-transparent w-40 border-b py-1 font-mono text-[18px] tracking-[0.25em] outline-none";

type Step =
  | { kind: "idle" }
  | { kind: "enrolling"; factorId: string; qrCode: string; secret: string }
  | { kind: "disabling" };

/** Seguridad: verificacion en dos pasos con una aplicacion de autenticacion (TOTP). */
export function SecuritySection({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function begin() {
    setMessage(null);
    startTransition(async () => {
      const result = await startMfaEnrollment();
      if (!result.ok) return setMessage({ text: result.message, error: true });
      setCode("");
      setStep({ kind: "enrolling", ...result });
    });
  }

  function confirm() {
    if (step.kind !== "enrolling") return;
    startTransition(async () => {
      const result = await confirmMfaEnrollment(step.factorId, code);
      setMessage({ text: result.message, error: !result.ok });
      if (result.ok) {
        setStep({ kind: "idle" });
        setCode("");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const result = await disableMfa(code);
      setMessage({ text: result.message, error: !result.ok });
      if (result.ok) {
        setStep({ kind: "idle" });
        setCode("");
      }
    });
  }

  function cancel() {
    setStep({ kind: "idle" });
    setCode("");
    setMessage(null);
  }

  return (
    <div>
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        Seguridad
      </div>

      <div className={rowClass}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px]">Verificación en dos pasos</span>
          <span className="text-muted-foreground max-w-[340px] font-mono text-[10.5px]">
            Además de tu contraseña, pide un código de 6 dígitos de una aplicación como
            Google Authenticator, Authy o 1Password.
          </span>
        </div>
        {step.kind === "idle" ? (
          <div className="flex items-baseline gap-4">
            <span className="text-muted-foreground font-mono text-[12px]">
              {enabled ? "activada" : "desactivada"}
            </span>
            <button
              type="button"
              className={buttonClass}
              disabled={pending}
              onClick={enabled ? () => setStep({ kind: "disabling" }) : begin}
            >
              {enabled ? "desactivar" : "activar"}
            </button>
          </div>
        ) : null}
      </div>

      {step.kind === "enrolling" ? (
        <div className="border-border flex flex-col gap-4 border-b py-4">
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-[13px]">
            <li>Escanea el código QR con tu aplicación de autenticación.</li>
            <li>Escribe aquí el código de 6 dígitos que te muestra.</li>
          </ol>
          <div className="flex flex-wrap items-start gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- es un data URI generado por Supabase */}
            <img
              src={step.qrCode}
              alt="Código QR para tu aplicación de autenticación"
              width={176}
              height={176}
              className="bg-white p-2"
            />
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] uppercase">
                ¿No puedes escanear? Escribe esta clave
              </span>
              <code className="font-mono text-[12px] break-all select-all">
                {step.secret}
              </code>
            </div>
          </div>
          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
                Código
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
                className={inputClass}
              />
            </label>
            <button type="submit" className={buttonClass} disabled={pending}>
              {pending ? "verificando..." : "confirmar y activar"}
            </button>
            <button type="button" className={buttonClass} onClick={cancel}>
              cancelar
            </button>
          </form>
          <p className="text-muted-foreground font-mono text-[10.5px]">
            Guarda la clave en un lugar seguro: si pierdes tu teléfono y no la tienes, no
            podrás entrar a tu cuenta sin ayuda.
          </p>
        </div>
      ) : null}

      {step.kind === "disabling" ? (
        <form
          className="border-border flex flex-wrap items-end gap-4 border-b py-4"
          onSubmit={(e) => {
            e.preventDefault();
            disable();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
              Código actual para confirmar
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              autoFocus
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? "desactivando..." : "desactivar"}
          </button>
          <button type="button" className={buttonClass} onClick={cancel}>
            cancelar
          </button>
        </form>
      ) : null}

      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-2 font-mono text-[10.5px] ${
            message.error ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
