import Link from "next/link";

/** Enlaces a la politica de privacidad y a los terminos (pantallas publicas). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p
      className={`text-muted-foreground flex gap-5 font-mono text-[10px] uppercase ${className ?? ""}`}
    >
      <Link href="/privacidad" className="underline-offset-4 hover:underline">
        Privacidad
      </Link>
      <Link href="/terminos" className="underline-offset-4 hover:underline">
        Términos
      </Link>
    </p>
  );
}
