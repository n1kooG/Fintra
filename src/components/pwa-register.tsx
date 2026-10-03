"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (/sw.js) al cargar la app, solo en
 * produccion: en desarrollo un service worker activo complica el
 * recargado en caliente. El boton de avisos de Configuracion lo registra
 * por su cuenta cuando hace falta (por ejemplo, para probar push en local).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sin service worker la app sigue funcionando; solo faltan avisos y modo sin conexion.
    });
  }, []);

  return null;
}
