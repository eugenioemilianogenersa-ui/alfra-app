import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import PwaInstallBanner from "@/components/PwaInstallBanner";

export const metadata: Metadata = {
  title: "AlFra 🍺",
  description: "Panel AlFra",
  applicationName: "AlFra App",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AlFra App",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1f14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // NO fuerzo userScalable false para evitar efectos raros/accesibilidad.
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className="h-full w-full">
      <body className="h-full w-full antialiased">
        {children}
        <PwaInstallBanner />
      </body>
    </html>
  );
}
