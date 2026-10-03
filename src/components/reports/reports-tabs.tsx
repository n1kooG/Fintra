import Link from "next/link";

const TABS = [
  { href: "/reportes", label: "Resumen" },
  { href: "/reportes/proyeccion", label: "Proyección" },
  { href: "/reportes/suscripciones", label: "Suscripciones y hormiga" },
  { href: "/reportes/honorarios", label: "Honorarios" },
] as const;

/** Pestañas de la seccion Reportes: cada una es una ruta, asi cada pantalla carga solo sus datos. */
export function ReportsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav
      className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.06em] uppercase"
      aria-label="Secciones de reportes"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={
            tab.href === active
              ? "border-foreground text-foreground border-b pb-1"
              : "text-muted-foreground pb-1"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
