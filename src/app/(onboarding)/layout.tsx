import { skipOnboardingAction } from "./skip-action";

/** Marco del asistente de primer uso: sin menu lateral, con salida clara. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-8">
      <header className="mb-12 flex items-baseline justify-between">
        <span className="text-[19px] font-medium">Fintra</span>
        <form action={skipOnboardingAction}>
          <button
            type="submit"
            className="text-muted-foreground font-mono text-[10.5px] uppercase underline underline-offset-4"
          >
            omitir por ahora
          </button>
        </form>
      </header>
      <main id="contenido" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
