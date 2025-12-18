import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ─────────────────────────────
  // 1) Rutas públicas
  // ─────────────────────────────
  const PUBLIC_ROUTES = ["/", "/login", "/signup", "/recuperar"];

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Assets / next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico|webp|mp4)$/)
  ) {
    return NextResponse.next();
  }

  // ─────────────────────────────
  // 2) Verificar sesión SOLO por cookie
  // ─────────────────────────────
  const hasSession =
    req.cookies.has("sb-access-token") ||
    req.cookies.has("sb-refresh-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ⚠️ IMPORTANTE:
  // NO validamos rol acá
  // NO llamamos Supabase
  // NO tocamos cookies

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
