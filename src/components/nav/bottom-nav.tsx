"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_LEFT, MOBILE_BOTTOM_RIGHT } from "./nav-items";

// Barra inferior: Inicio, Movimientos, + (alta rapida), Presupuestos, Mas.
// "Mas" agrupa el resto de las secciones (Cuentas, Tarjetas, Inversiones,
// Reportes, Calendario) mas Configuracion — ver src/app/(app)/mas/page.tsx.
const LEFT = MOBILE_BOTTOM_LEFT;
const RIGHT = MOBILE_BOTTOM_RIGHT;

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 flex h-[70px] items-center border-t px-2 backdrop-blur md:hidden print:hidden">
      {LEFT.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-1 flex-col items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase"
        >
          <span
            className={cn(
              isActive(item.href)
                ? "border-foreground text-foreground border-b pb-0.5 font-medium"
                : "text-muted-foreground",
            )}
          >
            {item.shortLabel}
          </span>
        </Link>
      ))}

      <div className="flex flex-1 flex-col items-center">
        <Link
          href="/movimientos/nuevo"
          aria-label="Nuevo movimiento"
          className="border-foreground flex size-[34px] items-center justify-center border font-mono text-[15px] leading-none"
        >
          +
        </Link>
      </div>

      {RIGHT.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-1 flex-col items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase"
        >
          <span
            className={cn(
              isActive(item.href)
                ? "border-foreground text-foreground border-b pb-0.5 font-medium"
                : "text-muted-foreground",
            )}
          >
            {item.shortLabel}
          </span>
        </Link>
      ))}

      <MoreMenuTrigger
        active={!LEFT.some((i) => isActive(i.href)) && !isActive(RIGHT[0].href)}
      />
    </nav>
  );
}

function MoreMenuTrigger({ active }: { active: boolean }) {
  return (
    <Link
      href="/mas"
      className="flex flex-1 flex-col items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase"
    >
      <span
        className={cn(
          active
            ? "border-foreground text-foreground border-b pb-0.5 font-medium"
            : "text-muted-foreground",
        )}
      >
        Mas
      </span>
    </Link>
  );
}
