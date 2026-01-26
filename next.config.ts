import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  /* Opciones de configuración */
  env: {
    // Aquí creamos una variable accesible desde toda la App
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
};

export default nextConfig;