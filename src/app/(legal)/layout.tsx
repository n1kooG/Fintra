import Link from "next/link";

/** Marco de las paginas legales: texto largo, columna angosta, sin menu de la app. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-8">
      <header className="mb-10 flex items-baseline justify-between">
        <Link href="/login" className="text-[19px] font-medium">
          Fintra
        </Link>
        <nav className="text-muted-foreground flex gap-5 font-mono text-[10.5px] uppercase">
          <Link href="/privacidad" className="underline-offset-4 hover:underline">
            Privacidad
          </Link>
          <Link href="/terminos" className="underline-offset-4 hover:underline">
            Términos
          </Link>
        </nav>
      </header>
      <main id="contenido" className="flex-1 pb-16">
        {children}
      </main>
    </div>
  );
}
