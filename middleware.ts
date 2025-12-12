// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// rutas públicas que NO requieren login
const PUBLIC_ROUTES = ["/", "/login", "/signup", "/recuperar"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) dejar pasar TODOS los archivos estáticos (imágenes, favicon, next, etc)
  const isStaticFile =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    // cualquier archivo con extensión (png, jpg, svg, css, js, etc)
    pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|webp|avif|mp4|webm|css|js)$/);

  if (isStaticFile) {
    return NextResponse.next();
  }

  // 2) dejar pasar las rutas públicas
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // 3) si querés proteger lo demás, acá iría tu lógica de sesión
  // por ahora lo dejamos pasar para no trabarte el desarrollo
  return NextResponse.next();
}

// esto hace que el middleware se aplique a TODAS las rutas,
// pero respete lo que escribimos arriba
export const config = {
  matcher: ["/:path*"],
};
