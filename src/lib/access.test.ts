import { describe, expect, it } from "vitest";
import { decideAccess, isPublicPath, PUBLIC_PATHS } from "./access";

describe("isPublicPath", () => {
  it.each(PUBLIC_PATHS)("%s es publica", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it("incluye subrutas de las publicas", () => {
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/icons/192")).toBe(true);
    expect(isPublicPath("/api/cron/diario")).toBe(true);
  });

  it("no confunde prefijos de texto con subrutas", () => {
    expect(isPublicPath("/login-falso")).toBe(false);
    expect(isPublicPath("/authx")).toBe(false);
    expect(isPublicPath("/privacidades")).toBe(false);
    expect(isPublicPath("/api/cronx")).toBe(false);
  });

  it.each([
    "/",
    "/dashboard",
    "/movimientos",
    "/configuracion",
    "/bienvenida",
    "/api/export/respaldo",
    "/api/import/respaldo",
  ])("%s exige sesion", (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
});

describe("decideAccess", () => {
  it("sin sesion manda las paginas privadas al login", () => {
    expect(decideAccess("/dashboard", false)).toBe("redirect-to-login");
    expect(decideAccess("/", false)).toBe("redirect-to-login");
  });

  it("sin sesion responde 401 en la API privada (no una pagina de login)", () => {
    expect(decideAccess("/api/export/respaldo", false)).toBe("unauthorized");
    expect(decideAccess("/api/import/respaldo", false)).toBe("unauthorized");
  });

  it("deja pasar lo publico, con o sin sesion", () => {
    expect(decideAccess("/privacidad", false)).toBe("allow");
    expect(decideAccess("/api/cron/diario", false)).toBe("allow");
    expect(decideAccess("/privacidad", true)).toBe("allow");
  });

  it("con sesion deja pasar lo privado", () => {
    expect(decideAccess("/dashboard", true)).toBe("allow");
    expect(decideAccess("/api/export/respaldo", true)).toBe("allow");
  });

  it("con sesion, login y registro llevan al dashboard", () => {
    expect(decideAccess("/login", true)).toBe("redirect-to-dashboard");
    expect(decideAccess("/registro", true)).toBe("redirect-to-dashboard");
  });

  it("con sesion, /recuperar y el callback siguen accesibles", () => {
    expect(decideAccess("/recuperar", true)).toBe("allow");
    expect(decideAccess("/auth/callback", true)).toBe("allow");
  });
});

describe("decideAccess · verificacion en dos pasos", () => {
  it("con el segundo paso pendiente, lo privado lleva a /verificar", () => {
    expect(decideAccess("/dashboard", true, true)).toBe("redirect-to-verify");
    expect(decideAccess("/movimientos", true, true)).toBe("redirect-to-verify");
    expect(decideAccess("/", true, true)).toBe("redirect-to-verify");
  });

  it("login y registro tambien llevan a /verificar (no al dashboard)", () => {
    expect(decideAccess("/login", true, true)).toBe("redirect-to-verify");
    expect(decideAccess("/registro", true, true)).toBe("redirect-to-verify");
  });

  it("la API privada responde 401 hasta completar el segundo paso", () => {
    expect(decideAccess("/api/export/respaldo", true, true)).toBe("unauthorized");
    expect(decideAccess("/api/import/respaldo", true, true)).toBe("unauthorized");
  });

  it("deja pasar /verificar y lo publico (callback de OAuth, legales, cron)", () => {
    expect(decideAccess("/verificar", true, true)).toBe("allow");
    expect(decideAccess("/auth/callback", true, true)).toBe("allow");
    expect(decideAccess("/privacidad", true, true)).toBe("allow");
    expect(decideAccess("/api/cron/diario", true, true)).toBe("allow");
  });

  it("/verificar sin sesion pide login; con sesion completa, lleva al dashboard", () => {
    expect(decideAccess("/verificar", false)).toBe("redirect-to-login");
    expect(decideAccess("/verificar", true, false)).toBe("redirect-to-dashboard");
  });

  it("sin segundo paso pendiente nada cambia", () => {
    expect(decideAccess("/dashboard", true, false)).toBe("allow");
    expect(decideAccess("/login", true, false)).toBe("redirect-to-dashboard");
  });

  it("no confunde prefijos de texto con /verificar", () => {
    expect(decideAccess("/verificar-falso", true, true)).toBe("redirect-to-verify");
  });
});
