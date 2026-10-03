type PlaceholderPageProps = {
  title: string;
  note: string;
};

/** Pantalla temporal para rutas que todavia no se construyen (ver el plan). */
export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-medium">{title}</h1>
      <p className="text-muted-foreground max-w-xs font-mono text-xs tracking-wide">
        {note}
      </p>
    </div>
  );
}
