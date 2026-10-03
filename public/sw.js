/*
 * Service worker de Fintra.
 *
 * Hace solo tres cosas, a proposito:
 *  1. Si no hay conexion al navegar, muestra una pagina de "sin conexion".
 *  2. Muestra las notificaciones push (vencimientos, presupuestos).
 *  3. Al tocar una notificacion, abre la pantalla correspondiente.
 *
 * NO guarda en cache paginas ni datos de la app: son datos financieros y
 * un cache los dejaria legibles en un dispositivo compartido, o mostraria
 * saldos desactualizados como si fueran de hoy.
 */

const CACHE = "fintra-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Fintra";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      // Con el mismo tag, un aviso nuevo reemplaza al anterior en vez de apilarse.
      tag: payload.tag || undefined,
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
