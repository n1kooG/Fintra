export type NavItem = {
  href: string;
  label: string;
  /** Etiqueta corta para la barra inferior movil (maximo ~8 caracteres). */
  shortLabel: string;
};

// Mismo orden que en el lienzo de diseno (design/d1).
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Inicio" },
  { href: "/movimientos", label: "Movimientos", shortLabel: "Movs." },
  { href: "/cuentas", label: "Cuentas", shortLabel: "Cuentas" },
  { href: "/recurrentes", label: "Recurrentes", shortLabel: "Recur." },
  { href: "/presupuestos", label: "Presupuestos", shortLabel: "Presup." },
  { href: "/metas", label: "Metas", shortLabel: "Metas" },
  { href: "/tarjetas", label: "Tarjetas", shortLabel: "Tarjetas" },
  { href: "/inversiones", label: "Inversiones", shortLabel: "Invers." },
  { href: "/reportes", label: "Reportes", shortLabel: "Reportes" },
  { href: "/calendario", label: "Calendario", shortLabel: "Calend." },
];

// La barra inferior movil solo tiene lugar comodo para 5 destinos:
// Inicio, Movimientos, + (alta rapida), Presupuestos y Mas (el resto).
const BOTTOM_HREFS = ["/dashboard", "/movimientos", "/presupuestos"];

export const MOBILE_BOTTOM_LEFT = NAV_ITEMS.filter((i) =>
  ["/dashboard", "/movimientos"].includes(i.href),
);
export const MOBILE_BOTTOM_RIGHT = NAV_ITEMS.filter((i) => i.href === "/presupuestos");

/** Todo lo que no entra en la barra inferior — se agrupa en /mas. */
export const MOBILE_MORE_ITEMS = NAV_ITEMS.filter((i) => !BOTTOM_HREFS.includes(i.href));
