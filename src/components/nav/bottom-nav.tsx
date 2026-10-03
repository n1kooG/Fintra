"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Ellipsis, House, PieChart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_LEFT, MOBILE_BOTTOM_RIGHT } from "./nav-items";

// Barra inferior flotante con efecto "vidrio liquido": Inicio, Movimientos, + (alta
// rapida), Presupuestos y Mas. "Mas" agrupa el resto de las secciones (Cuentas,
// Tarjetas, Inversiones, Reportes, Calendario) mas Configuracion — ver
// src/app/(app)/mas/page.tsx.
//
// El vidrio es una aproximacion en CSS: fondo translucido + desenfoque y saturacion
// de lo que pasa por detras + borde y brillo superior. El texto no depende del fondo:
// va siempre en el color principal para mantener el contraste.
const LEFT = MOBILE_BOTTOM_LEFT;
const RIGHT = MOBILE_BOTTOM_RIGHT;

const ICONS = {
  "/dashboard": House,
  "/movimientos": ArrowLeftRight,
  "/presupuestos": PieChart,
} as const;

const itemClass =
  "relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full font-mono text-[9.5px] tracking-[0.04em] uppercase transition-colors";

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav
      aria-label="Navegación principal"
      className="border-foreground/15 bg-background/55 fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 flex h-16 items-center gap-1 rounded-full border p-1.5 shadow-[0_10px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl backdrop-saturate-150 md:hidden print:hidden"
    >
      {LEFT.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.shortLabel}
          active={isActive(item.href)}
          Icon={ICONS[item.href as keyof typeof ICONS]}
        />
      ))}

      <Link
        href="/movimientos/nuevo"
        aria-label="Nuevo movimiento"
        className="bg-foreground text-background mx-1 flex size-12 shrink-0 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-95"
      >
        <Plus className="size-6" strokeWidth={2.25} aria-hidden />
      </Link>

      {RIGHT.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.shortLabel}
          active={isActive(item.href)}
          Icon={ICONS[item.href as keyof typeof ICONS]}
        />
      ))}

      <NavLink
        href="/mas"
        label="Más"
        active={!LEFT.some((i) => isActive(i.href)) && !isActive(RIGHT[0].href)}
        Icon={Ellipsis}
      />
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        active
          ? "bg-foreground/15 text-foreground font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          : "text-foreground/75",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
