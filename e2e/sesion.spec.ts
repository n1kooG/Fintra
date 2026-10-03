import { expect, test, type Page } from "@playwright/test";

/**
 * Recorrido con sesión: necesita un usuario de PRUEBA ya registrado y con su espacio
 * configurado (no uses tu cuenta real: la prueba crea una cuenta y un gasto).
 *
 *   E2E_EMAIL=prueba@ejemplo.com E2E_PASSWORD=... npm run test:e2e
 *
 * Si ese usuario tiene verificación en dos pasos activada, la prueba se omite.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, "Faltan E2E_EMAIL y E2E_PASSWORD");

const ROUTES = [
  "/dashboard",
  "/movimientos",
  "/movimientos/nuevo",
  "/cuentas",
  "/recurrentes",
  "/presupuestos",
  "/metas",
  "/tarjetas",
  "/inversiones",
  "/reportes",
  "/reportes/proyeccion",
  "/reportes/suscripciones",
  "/reportes/honorarios",
  "/calendario",
  "/configuracion",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  test.skip(page.url().includes("/verificar"), "El usuario de prueba tiene 2FA activada");
  test.skip(
    page.url().includes("/bienvenida"),
    "El usuario de prueba no terminó el onboarding",
  );
}

test.describe("con sesión", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("todas las pantallas cargan sin errores de consola ni de CSP", async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`${page.url()} · ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`${page.url()} · ${error.message}`));

    for (const route of ROUTES) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first(), route).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("el buscador (Ctrl+K) abre, filtra y se cierra sin errores", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Ir a una pantalla o ejecutar una acción...");
    await expect(input).toBeVisible();
    await input.fill("presup");
    await expect(page.getByRole("option", { name: /Presupuestos/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("crear una cuenta, cargar un gasto y ver el saldo", async ({ page }) => {
    const name = `E2E ${Date.now()}`;

    await page.goto("/cuentas");
    await page.getByRole("button", { name: "+ Agregar cuenta" }).click();
    await page.getByLabel("Nombre").fill(name);
    await page.getByLabel("Saldo inicial").fill("100000");
    await page.getByRole("button", { name: "Guardar cuenta" }).click();
    await expect(page.getByText(name)).toBeVisible();

    await page.goto("/movimientos/nuevo");
    await page.getByLabel(/^Monto/).fill("25000");
    await page.getByLabel("Comercio").fill("Compra de prueba E2E");
    // la cuenta recién creada: se elige en el selector
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Guardar movimiento" }).click();
    await page.waitForURL(/\/(movimientos|dashboard)/);

    await page.goto("/cuentas");
    const row = page.locator("li, tr, div").filter({ hasText: name }).last();
    await expect(row).toContainText("75.000");

    await page.goto("/movimientos");
    await expect(page.getByText("Compra de prueba E2E").first()).toBeVisible();
  });
});
