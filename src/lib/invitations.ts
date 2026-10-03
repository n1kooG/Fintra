/**
 * Reglas puras de las invitaciones a un espacio compartido (sin base de
 * datos, para poder probarlas). El token viaja en el enlace; la base solo
 * guarda su hash SHA-256.
 */

export const INVITE_TTL_DAYS = 7;

/** 32 bytes aleatorios en base64url = 43 caracteres. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ¿Tiene la forma de un token nuestro? Se comprueba antes de ir a la base. */
export function isValidTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** SHA-256 en hexadecimal. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteExpiry(now: Date, days = INVITE_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type InviteState = "valid" | "expired" | "accepted";

export function inviteState(
  invite: { expiresAt: string | Date; acceptedAt: string | Date | null },
  now: Date = new Date(),
): InviteState {
  if (invite.acceptedAt) return "accepted";
  return new Date(invite.expiresAt).getTime() <= now.getTime() ? "expired" : "valid";
}

/** Compara correos sin distinguir mayusculas ni espacios de los bordes. */
export function emailsMatch(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const INVITE_ERROR = {
  invalid: "El enlace de invitación no es válido.",
  expired: "Esta invitación venció. Pide que te envíen una nueva.",
  accepted: "Esta invitación ya se usó.",
  wrongEmail:
    "Esta invitación es para otro correo. Inicia sesión con la cuenta a la que se invitó.",
  alreadyMember: "Ya formas parte de este espacio.",
  ownsSharedSpace:
    "Eres el propietario de un espacio compartido con otras personas. Elimina o traspasa ese espacio antes de unirte a otro.",
  hasData:
    "Tu cuenta ya tiene movimientos cargados y no se pueden mezclar con otro espacio. Usa otra cuenta, o exporta y elimina tus datos antes de unirte.",
} as const;
