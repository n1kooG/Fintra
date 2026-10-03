/** Marco de la pagina de una invitacion: columna angosta, sin menu de la app. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-8">
      <header className="mb-12">
        <span className="text-[19px] font-medium">Fintra</span>
      </header>
      <main id="contenido" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
