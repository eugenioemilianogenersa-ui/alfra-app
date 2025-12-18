import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ─────────────────────────────────────────
  // 1) Rutas públicas
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // 2) Crear cliente Supabase SSR
  // ─────────────────────────────────────────
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach((c) =>
            res.cookies.set(c.name, c.value, c.options)
          );
        },
      },
    }
  );

  // ─────────────────────────────────────────
  // 3) Chequear sesión
  // ─────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No logueado → login
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ─────────────────────────────────────────
  // 4) Leer rol
  // ─────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "cliente";

  // Admin preview permitido
  const isAdminPreview =
    role === "admin" && searchParams.get("preview") === "true";

  // ─────────────────────────────────────────
  // 5) Guards por ruta
  // ─────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  if (pathname.startsWith("/delivery")) {
    if (role !== "delivery" && !isAdminPreview) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Todo OK
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
