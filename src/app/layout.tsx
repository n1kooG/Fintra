import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Fintra",
    template: "%s · Fintra",
  },
  description: "Gestor de finanzas personales.",
  icons: { apple: "/icons/apple" },
  appleWebApp: { capable: true, title: "Fintra", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#100f0d" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El nonce del CSP (lo genera proxy.ts). Leer los encabezados tambien hace
  // dinamico todo el arbol, que es lo que exige un CSP con nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${sourceSerif.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-serif">
        <ThemeProvider
          attribute="class"
          nonce={nonce}
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
            <PwaRegister />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
