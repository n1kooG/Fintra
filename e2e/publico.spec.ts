import { expect, test } from "@playwright/test";

/** Lo que cualquiera puede ver sin sesion, y lo que NO debe poder ver. */

test.describe("sin sesión", () => {
  test("una página privada manda al login conservando el destino", async ({ page }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/login\?next=%2Fmovimientos$/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("la pantalla de verificación en dos pasos tampoco se ve sin sesión", async ({
    page,
  }) => {
    await page.goto("/verificar");
    await expect(page).toHaveURL(/\/login\?next=%2Fverificar$/);
  });

  test("la API privada responde 401 en JSON, no una página de login", async ({
    request,
  }) => {
    for (const path of [
      "/api/export/respaldo",
      "/api/export/movimientos",
      "/api/export/calendario",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(401);
      expect(response.headers()["content-type"], path).toContain("application/json");
    }
  });

  test("las páginas legales se leen sin iniciar sesión", async ({ page }) => {
    for (const path of ["/privacidad", "/terminos"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("el formulario de login tiene sus campos y el enlace a registro", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Regístrate" })).toBeVisible();
  });
});

test.describe("encabezados de seguridad", () => {
  const nonceOf = (csp: string) => csp.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];

  test("CSP con nonce propio en cada petición y sin unsafe-inline en scripts", async ({
    request,
  }) => {
    const first = (await request.get("/login")).headers()["content-security-policy"];
    const second = (await request.get("/login")).headers()["content-security-policy"];
    expect(first).toBeTruthy();
    expect(first).toMatch(/script-src [^;]*nonce-[A-Za-z0-9+/=]+/);
    expect(first.match(/script-src[^;]*/)![0]).not.toContain("unsafe-inline");
    expect(first).toContain("frame-ancestors 'none'");
    expect(nonceOf(first)).toBeTruthy();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });

  test("encabezados estáticos presentes", async ({ request }) => {
    const headers = (await request.get("/login")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("las páginas públicas cargan sin errores de consola ni violaciones de CSP", async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    for (const path of [
      "/login",
      "/registro",
      "/recuperar",
      "/privacidad",
      "/terminos",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });
});

test.describe("PWA", () => {
  test("el manifest y el service worker se sirven sin sesión", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect(((await manifest.json()) as { name?: string }).name).toBeTruthy();
    const worker = await request.get("/sw.js");
    expect(worker.status()).toBe(200);
    expect(worker.headers()["cache-control"]).toContain("no-cache");
  });
});
