import Link from "next/link";

const TABS = [
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/metas", label: "Metas de ahorro" },
] as const;

/** Pestanas entre Presupuestos y Metas (comparten el mismo bloque del diseno). */
export function BudgetsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="flex gap-6 font-mono text-[11px] tracking-[0.06em] uppercase">
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
