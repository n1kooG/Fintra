"use client";

/** Abre el dialogo de impresion del navegador: ahi se elige «Guardar como PDF». */
export function PrintButton({ label = "guardar pdf" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase print:hidden"
    >
      {label}
    </button>
  );
}
