import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-medium">Esta página no existe</h1>
      <p className="text-muted-foreground font-mono text-[12px]">
        El enlace puede estar mal escrito o la página se movió.
      </p>
      <Link
        href="/dashboard"
        className="border-foreground border-b pb-0.5 font-mono text-[11px] uppercase"
      >
        ir al inicio
      </Link>
    </div>
  );
}
