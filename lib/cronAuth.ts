import { NextResponse } from "next/server";

/**
 * Auth para llamadas automáticas desde tu servidor.
 * - cron_secret: via querystring
 * - cron bearer: via Authorization: Bearer <token> (opcional, pero recomendado)
 *
 * Modo seguro sin romper:
 * - requireCronAuthIfPresent(): solo exige auth si detecta cron_secret en la URL.
 * - requireCronAuth(): exige siempre (para endpoints que NO deben ser públicos, ej health).
 */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function misconfigured() {
  return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
}

function extractBearer(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

export function requireCronAuth(req: Request): NextResponse | null {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("cron_secret");

  const requiredSecret = process.env.CRON_SECRET || "";
  if (!requiredSecret) return misconfigured();

  // Siempre exigimos cron_secret
  if (!secret || secret !== requiredSecret) return unauthorized();

  // Bearer recomendado: si está seteado, lo exigimos
  const requiredBearer = process.env.CRON_BEARER_TOKEN || "";
  if (requiredBearer) {
    const token = extractBearer(req);
    if (!token || token !== requiredBearer) return unauthorized();
  }

  return null;
}

export function requireCronAuthIfPresent(req: Request): NextResponse | null {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("cron_secret");

  // Si NO viene cron_secret, NO exigimos nada (para no romper manual)
  if (!secret) return null;

  // Si viene, exigimos cron_auth completo
  return requireCronAuth(req);
}
