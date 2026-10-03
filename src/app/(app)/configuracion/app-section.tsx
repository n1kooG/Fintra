"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import {
  getPushTopics,
  removePushSubscription,
  savePushSubscription,
  sendTestNotification,
  setPushTopics,
} from "@/server/actions/notifications";
import { ALL_TOPICS, NOTICE_TOPICS, type NoticeTopic } from "@/lib/notifications";

type PushStatus = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

const buttonClass =
  "border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase disabled:opacity-50";
const rowClass =
  "border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-3";

// --- Instalar la app ---------------------------------------------------------

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  };
}

function useStandalone(): boolean {
  return useSyncExternalStore(
    subscribeMedia("(display-mode: standalone)"),
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
}

function useIsIos(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );
}

function InstallApp() {
  const standalone = useStandalone();
  const isIos = useIsIos();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function onInstalled() {
      setPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <div className={rowClass}>
      <span className="text-[14.5px]">Instalar como app</span>
      {standalone ? (
        <span className="text-muted-foreground font-mono text-[12px]">ya instalada</span>
      ) : prompt ? (
        <button
          type="button"
          className={buttonClass}
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          instalar
        </button>
      ) : isIos ? (
        <span className="text-muted-foreground max-w-[260px] text-right font-mono text-[11px]">
          En Safari: compartir → «Agregar a inicio»
        </span>
      ) : (
        <span className="text-muted-foreground max-w-[260px] text-right font-mono text-[11px]">
          Usa el menú del navegador → «Instalar Fintra»
        </span>
      )}
    </div>
  );
}

// --- Avisos push -------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function detectStatus(vapidPublicKey: string | null): Promise<PushStatus> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (!vapidPublicKey) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

const STATUS_TEXT: Record<Exclude<PushStatus, "checking" | "off" | "on">, string> = {
  unsupported: "Este navegador no los admite (en iPhone, instala la app primero)",
  unconfigured: "No configurados en el servidor",
  denied: "Bloqueados: actívalos en los permisos del navegador",
};

/** Que tipos de aviso recibe ESTE dispositivo (cada uno elige los suyos). */
function TopicPicker() {
  const [topics, setTopics] = useState<NoticeTopic[] | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || cancelled) return;
      const current = await getPushTopics(subscription.endpoint);
      if (cancelled) return;
      setEndpoint(subscription.endpoint);
      setTopics(current);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!topics || !endpoint) return null;

  function toggle(topic: NoticeTopic, checked: boolean) {
    const next = ALL_TOPICS.filter((t) => (t === topic ? checked : topics!.includes(t)));
    const previous = topics;
    setTopics(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setPushTopics(endpoint!, next);
      if (!result.ok) {
        setTopics(previous);
        setMessage(result.message);
      }
    });
  }

  return (
    <fieldset className="border-border border-b pb-3" disabled={pending}>
      <legend className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        Qué avisos recibir en este dispositivo
      </legend>
      <div className="flex flex-col gap-2">
        {NOTICE_TOPICS.map((topic) => (
          <label key={topic.id} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="accent-foreground mt-1 size-4"
              checked={topics.includes(topic.id)}
              onChange={(e) => toggle(topic.id, e.target.checked)}
            />
            <span className="flex flex-col">
              <span className="text-[14px]">{topic.label}</span>
              <span className="text-muted-foreground font-mono text-[10.5px]">
                {topic.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {message ? (
        <p role="alert" className="text-destructive mt-2 font-mono text-[10.5px]">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}

function Notifications({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    detectStatus(vapidPublicKey).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  function enable() {
    startTransition(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        });
        const json = subscription.toJSON();
        const result = await savePushSubscription({
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          userAgent: navigator.userAgent,
        });
        setMessage(result.message);
        setStatus(result.ok ? "on" : "off");
        if (!result.ok) await subscription.unsubscribe();
      } catch {
        setMessage("No pudimos activar los avisos en este dispositivo.");
        setStatus("off");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      setMessage(null);
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await removePushSubscription(endpoint);
        }
        setStatus("off");
      } catch {
        setMessage("No pudimos desactivar los avisos.");
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestNotification();
      setMessage(result.message);
    });
  }

  return (
    <>
      <div className={rowClass}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px]">Avisos</span>
          <span className="text-muted-foreground max-w-[340px] font-mono text-[10.5px]">
            Vencimientos de tarjeta y cuotas, recurrentes de mañana y presupuestos al 80%
            y al 100%. Se envían una vez por la mañana.
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {status === "checking" ? (
            <span className="text-muted-foreground font-mono text-[12px]">...</span>
          ) : status === "off" || status === "on" ? (
            <div className="flex items-baseline gap-4">
              {status === "on" ? (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending}
                  onClick={sendTest}
                >
                  enviar prueba
                </button>
              ) : null}
              <button
                type="button"
                className={buttonClass}
                disabled={pending}
                onClick={status === "on" ? disable : enable}
              >
                {status === "on" ? "desactivar" : "activar en este dispositivo"}
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground max-w-[260px] text-right font-mono text-[11px]">
              {STATUS_TEXT[status]}
            </span>
          )}
          {message ? (
            <span role="status" className="text-muted-foreground font-mono text-[10.5px]">
              {message}
            </span>
          ) : null}
        </div>
      </div>
      {status === "on" ? <TopicPicker /> : null}
    </>
  );
}

/** Instalar la app y activar los avisos push (Configuracion). */
export function AppSection({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        Aplicación
      </div>
      <InstallApp />
      <Notifications vapidPublicKey={vapidPublicKey} />
    </div>
  );
}
