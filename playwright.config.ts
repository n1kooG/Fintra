import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta. Dos formas de correrlas:
 *
 *  - Contra un servidor local ya construido:  npm run build && npm run test:e2e
 *    (Playwright levanta `next start` en el puerto 3100).
 *  - Contra un sitio ya desplegado (p. ej. la preview de Vercel):
 *    E2E_BASE_URL=https://mi-preview.vercel.app npm run test:e2e
 *
 * Por defecto usa el Chromium de Playwright (`npx playwright install chromium`). Para usar
 * un navegador que ya tengas instalado: E2E_BROWSER_CHANNEL=chrome (o msedge).
 *
 * e2e/publico.spec.ts no necesita credenciales. e2e/sesion.spec.ts necesita un usuario de
 * prueba (E2E_EMAIL y E2E_PASSWORD) y se omite si faltan.
 */
const port = 3100;
const externalUrl = process.env.E2E_BASE_URL;
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: externalUrl ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], channel } },
    { name: "movil", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: externalUrl
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: `http://localhost:${port}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
