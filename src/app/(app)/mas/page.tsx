import Link from "next/link";
import { MOBILE_MORE_ITEMS } from "@/components/nav/nav-items";

// Solo visible en el flujo movil: agrupa las secciones que no entran en la
// barra inferior (Cuentas, Tarjetas, Inversiones, Reportes, Calendario)
// mas Configuracion.
export default function MasPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-8 md:hidden">
      <h1 className="text-xl font-medium">Mas</h1>
      <nav className="flex flex-col">
        {MOBILE_MORE_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border-border border-b py-3.5 text-[15px] italic"
          >
            {item.label}
          </Link>
        ))}
        <Link href="/configuracion" className="py-3.5 text-[15px] italic">
          Configuracion
        </Link>
      </nav>
    </div>
  );
}
