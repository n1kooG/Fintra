import { ImageResponse } from "next/og";

/**
 * Iconos de la PWA, generados (no hay archivos binarios en el repo): la
 * "F" del libro mayor sobre el fondo oscuro, con una linea de asiento
 * contable debajo. El maskable deja un margen mas grande: Android lo
 * recorta en circulo, cuadrado o gota segun el telefono, y solo el 80%
 * central esta garantizado a la vista.
 */
const ICONS = {
  "192": { size: 192, scale: 1 },
  "512": { size: 512, scale: 1 },
  maskable: { size: 512, scale: 0.74 },
  apple: { size: 180, scale: 1 },
} as const;

type IconName = keyof typeof ICONS;

export function generateStaticParams() {
  return (Object.keys(ICONS) as IconName[]).map((name) => ({ name }));
}

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const icon = ICONS[name as IconName];
  if (!icon) return new Response("No encontrado", { status: 404 });

  const { size, scale } = icon;
  const letter = size * 0.52 * scale;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#100f0d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: letter, lineHeight: 1, color: "#e4e1d8", fontWeight: 600 }}>
        F
      </div>
      <div
        style={{
          width: size * 0.34 * scale,
          height: Math.max(2, size * 0.014),
          background: "#b4734f",
          marginTop: size * 0.05 * scale,
        }}
      />
    </div>,
    { width: size, height: size },
  );
}
