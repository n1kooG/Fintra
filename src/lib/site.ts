/** Datos del sitio que usan las paginas legales y el pie de las pantallas publicas. */
export const APP_NAME = "Fintra";

/** Fecha de la ultima revision de la politica de privacidad y de los terminos. */
export const LEGAL_UPDATED = "2 de octubre de 2026";

/**
 * Correo de contacto para consultas y derechos sobre los datos. Se define con
 * NEXT_PUBLIC_CONTACT_EMAIL; si falta, las paginas legales lo omiten en vez
 * de mostrar uno inventado.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
