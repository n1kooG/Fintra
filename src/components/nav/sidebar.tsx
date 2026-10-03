"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { OpenPaletteButton } from "@/components/command-palette";
import { NAV_ITEMS } from "./nav-items";

type SidebarProps = {
  displayName: string;
  householdName: string;
};

export function Sidebar({ displayName, householdName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="border-border sticky top-0 hidden h-dvh w-[206px] shrink-0 flex-col justify-between self-start overflow-y-auto border-r px-7 py-8 md:flex print:hidden">
      <div>
        <Link href="/dashboard" className="mb-12 block text-[19px] font-medium">
          Fintra
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "border-b py-2.5 font-mono text-[11px] tracking-[0.08em] uppercase",
                  active
                    ? "border-foreground text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <OpenPaletteButton className="text-muted-foreground hover:text-foreground focus-visible:text-foreground mt-8 block font-mono text-[10px] tracking-[0.08em] uppercase" />
      </div>

      <Link
        href="/configuracion"
        className={cn(
          "border-border border-t pt-3.5 font-mono text-[11px] transition-colors",
          pathname.startsWith("/configuracion")
            ? "border-t-foreground text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <div className="truncate">{displayName}</div>
        <div className="text-muted-foreground truncate">{householdName}</div>
      </Link>
    </aside>
  );
}
