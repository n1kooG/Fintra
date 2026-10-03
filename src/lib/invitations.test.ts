import { describe, expect, it } from "vitest";
import {
  emailsMatch,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  isValidTokenShape,
} from "./invitations";

describe("tokens de invitacion", () => {
  it("tienen 43 caracteres base64url y son distintos cada vez", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidTokenShape(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rechazan formas que no son de un token", () => {
    expect(isValidTokenShape("")).toBe(false);
    expect(isValidTokenShape("corto")).toBe(false);
    expect(isValidTokenShape("a".repeat(44))).toBe(false);
    expect(isValidTokenShape(`${"a".repeat(42)}!`)).toBe(false);
    expect(isValidTokenShape("a".repeat(42) + "/")).toBe(false);
  });

  it("el hash es SHA-256 hexadecimal, determinista y no revela el token", async () => {
    const token = "a".repeat(43);
    const h1 = await hashInviteToken(token);
    const h2 = await hashInviteToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(token);
    expect(await hashInviteToken("b".repeat(43))).not.toBe(h1);
  });

  it("coincide con el SHA-256 conocido de 'abc'", async () => {
    expect(await hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("estado de la invitacion", () => {
  const now = new Date("2026-10-05T12:00:00Z");

  it("vigente antes de vencer", () => {
    expect(
      inviteState({ expiresAt: "2026-10-06T00:00:00Z", acceptedAt: null }, now),
    ).toBe("valid");
  });

  it("vencida justo al vencer", () => {
    expect(
      inviteState({ expiresAt: "2026-10-05T12:00:00Z", acceptedAt: null }, now),
    ).toBe("expired");
  });

  it("ya aceptada manda sobre la fecha", () => {
    expect(
      inviteState(
        { expiresAt: "2030-01-01T00:00:00Z", acceptedAt: "2026-10-01T00:00:00Z" },
        now,
      ),
    ).toBe("accepted");
  });

  it("vence a los 7 dias por defecto", () => {
    expect(inviteExpiry(now).toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });
});

describe("emailsMatch", () => {
  it("ignora mayusculas y espacios", () => {
    expect(emailsMatch(" Ana@Mail.com ", "ana@mail.com")).toBe(true);
  });

  it("distingue correos distintos", () => {
    expect(emailsMatch("ana@mail.com", "ana2@mail.com")).toBe(false);
  });

  it("nunca coincide con vacio o nulo", () => {
    expect(emailsMatch(null, "a@b.c")).toBe(false);
    expect(emailsMatch("", "")).toBe(false);
    expect(emailsMatch(undefined, undefined)).toBe(false);
  });
});
