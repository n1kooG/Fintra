/*
 * Service worker de Fintra.
 *
 * Que hace, a proposito:
 *  1. Si no hay conexion al navegar, muestra una pagina de "sin conexion".
 *  2. Guarda los archivos ESTATICOS de la app (JS, CSS, fuentes e iconos con nombre
 *     versionado) para que abra rapido, incluso con mala senal.
 *  3. Muestra las notificaciones push (vencimientos, presupuestos).
 *  4. Al tocar una notificacion, abre la pantalla correspondiente.
 *
 * NO guarda en cache paginas ni datos de la app (HTML, RSC, /api): son datos
 * financieros y un cache los dejaria legibles en un dispositivo compartido, o
 * mostraria saldos desactualizados como si fueran de hoy.
 */

const OFFLINE_CACHE = "fintra-offline-v2";
const STATIC_CACHE = "fintra-static-v2";
const OFFLINE_URL = "/offline.html";
const KNOWN_CACHES = [OFFLINE_CACHE, STATIC_CACHE];
const MAX_STATIC_ENTRIES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !KNOWN_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );
      // Navegacion mas rapida: el navegador empieza la peticion mientras arranca el worker.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

/** Archivos estaticos seguros de guardar: no llevan datos de ninguna persona. */
function isStaticAsset(url) {
  // En desarrollo (localhost) los archivos conservan su nombre aunque cambien: no se guardan.
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
  return (
    !isLocal &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      /\.(?:woff2?|ttf|otf)$/.test(url.pathname))
  );
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_STATIC_ENTRIES) {
    await Promise.all(
      keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map((k) => cache.delete(k)),
    );
  }
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  // /_next/static/ lleva el hash en el nombre (inmutable): si esta, se usa tal cual.
  // Los iconos se refrescan en segundo plano.
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(cache));
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    if (!new URL(request.url).pathname.startsWith("/_next/static/"))
      refresh.catch(() => {});
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  const url = new URL(request.url);
  if (isStaticAsset(url)) event.respondWith(staticAsset(request));
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
