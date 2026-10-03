"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

const STORAGE_KEY = "fintra:privacy";
// Evento propio: el evento nativo "storage" del navegador solo se
// dispara en OTRAS pestanas, nunca en la que hizo el cambio.
const CHANGE_EVENT = "fintra:privacy-change";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // localStorage puede fallar (modo privado, cuotas) — arranca desactivado.
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot() {
  return false;
}

type PrivacyContextValue = {
  hidden: boolean;
  toggle: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore resuelve el problema de hidratacion correctamente
  // (sin el patron "mounted" + setState en un efecto): en el servidor usa
  // getServerSnapshot (false), y en el cliente se resincroniza solo con el
  // valor real apenas monta, sin causar un render en cascada manual.
  const hidden = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !readStored();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // La preferencia no persiste entre recargas, pero el toggle igual funciona.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return (
    <PrivacyContext.Provider value={{ hidden, toggle }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy debe usarse dentro de <PrivacyProvider>");
  return ctx;
}
