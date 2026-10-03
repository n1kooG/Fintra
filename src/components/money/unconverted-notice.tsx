import Link from "next/link";

/**
 * Aviso honesto cuando un total consolidado deja afuera montos que no se
 * pudieron convertir (falta la cotizacion de esa fecha): mejor decirlo
 * que mostrar un total que parece exacto y no lo es.
 */
export function UnconvertedNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="text-muted-foreground font-mono text-[10.5px]">
      {count === 1 ? "1 monto quedó" : `${count} montos quedaron`} fuera del total por
      falta de cotización.{" "}
      <Link href="/configuracion" className="border-muted-foreground border-b">
        Actualizar cotizaciones
      </Link>
    </p>
  );
}
