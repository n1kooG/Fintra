import { RegistroForm } from "./registro-form";
import { LegalLinks } from "@/components/legal-links";

import { safeNextPath } from "@/lib/safe-redirect";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="bg-card hidden flex-col justify-between p-13 md:flex md:w-[52%]">
        <span className="text-[19px] font-medium">Fintra</span>
        <div className="max-w-[420px]">
          <p className="mb-5 text-[34px] leading-[1.35] italic">
            &ldquo;Un registro simple de cada peso, para saber siempre dónde estás
            parado.&rdquo;
          </p>
          <p className="text-muted-foreground font-mono text-[10.5px] tracking-[0.08em] uppercase">
            Gestión de finanzas personales
          </p>
        </div>
        <span className="text-muted-foreground font-mono text-[10px]">
          &copy; {new Date().getFullYear()} Fintra
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 md:px-0">
        <RegistroForm next={next} />
        <LegalLinks />
      </div>
    </div>
  );
}
