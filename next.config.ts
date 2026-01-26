// C:\Dev\alfra-app\next.config.ts
import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },

  // ✅ No rompe nada: habilita formatos modernos para next/image
  images: {
    formats: ["image/avif", "image/webp"],
    // Si más adelante pasamos imágenes remotas (Supabase) a next/image,
    // agregamos remotePatterns en ese momento (sin tocar ahora).
  },
};

export default nextConfig;
