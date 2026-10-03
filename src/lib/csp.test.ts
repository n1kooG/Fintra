import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

const SUPABASE = "https://abcd1234.supabase.co";

function directive(csp: string, name: string): string | undefined {
  return csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
}

describe("buildCsp (produccion)", () => {
  const csp = buildCsp({ nonce: "N0NCE", isDev: false, supabaseUrl: SUPABASE });

  it("solo ejecuta scripts con el nonce de la peticion", () => {
    const script = directive(csp, "script-src")!;
    expect(script).toContain("'nonce-N0NCE'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("bloquea plugins, iframes ajenos y cambios de <base>", () => {
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
  });

  it("no restringe form-action (rompe el login con Google al seguir redirecciones)", () => {
    expect(directive(csp, "form-action")).toBeUndefined();
  });

  it("permite hablar con Supabase y con nadie mas", () => {
    const connect = directive(csp, "connect-src")!;
    expect(connect).toContain(SUPABASE);
    expect(connect).toContain("wss://abcd1234.supabase.co");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("localhost");
  });

  it("sube a https y permite el service worker propio", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self'");
  });
});

describe("buildCsp (desarrollo)", () => {
  const csp = buildCsp({ nonce: "N0NCE", isDev: true, supabaseUrl: SUPABASE });

  it("permite eval (React en desarrollo) pero no inline", () => {
    const script = directive(csp, "script-src")!;
    expect(script).toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("no fuerza https en localhost y deja pasar el HMR", () => {
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(directive(csp, "connect-src")).toContain("ws://localhost:*");
  });
});

describe("buildCsp con configuracion incompleta", () => {
  it("sin URL de Supabase igual produce una politica valida", () => {
    const csp = buildCsp({ nonce: "x", isDev: false });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("una URL invalida no rompe la politica", () => {
    const csp = buildCsp({ nonce: "x", isDev: false, supabaseUrl: "esto no es una url" });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });
});

describe("generateNonce", () => {
  it("es distinto en cada llamada y solo usa caracteres validos en un nonce", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});
