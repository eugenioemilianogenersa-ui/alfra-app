import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// rutas públicas que NO requieren login
const PUBLIC_ROUTES = ["/", "/login", "/signup", "/recuperar"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) dejar pasar archivos estáticos
  const isStaticFile =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|webp|avif|mp4|webm|css|js)$/);

  if (isStaticFile) {
    return NextResponse.next();
  }

  // 2) rutas públicas
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // 3) TODO lo demás pasa (la seguridad real está en RLS + endpoints)
  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
