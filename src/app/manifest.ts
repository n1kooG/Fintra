import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA: con esto el navegador ofrece "Instalar app" y la
 * abre en su propia ventana, sin barra de direcciones. Los colores son
 * los del tema oscuro (el predeterminado de la app).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fintra · Finanzas personales",
    short_name: "Fintra",
    description: "Gestor de finanzas personales para Chile.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-CL",
    background_color: "#100f0d",
    theme_color: "#100f0d",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", short_name: "Nuevo", url: "/movimientos/nuevo" },
      { name: "Presupuestos", url: "/presupuestos" },
      { name: "Calendario", url: "/calendario" },
    ],
  };
}
