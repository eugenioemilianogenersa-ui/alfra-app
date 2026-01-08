import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CookiesToSetItem = {
  name: string;
  value: string;
  options: CookieOptions;
};

async function getUserFromCookie(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSetItem[]) {
          cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user };
}

async function getUserFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user };
}

async function run(req: NextRequest) {
  // Auth: cookie o bearer
  const cookieAuth = await getUserFromCookie(req);
  const bearerAuth = cookieAuth ? null : await getUserFromBearer(req);
  const authCtx = cookieAuth || bearerAuth;

  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user } = authCtx;

  // Solo ADMIN/STAFF
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(me?.role || "").toUpperCase();
  if (!["ADMIN", "STAFF"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";

  // Si tenés INTERNAL_PUSH_KEY, lo mandamos (por si protegés endpoints internos)
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INTERNAL_PUSH_KEY) headers["x-internal-key"] = process.env.INTERNAL_PUSH_KEY;

  const r = await fetch(`${base}/api/fudo/sync`, { method: "GET", headers });
  const j = await r.json().catch(() => null);

  if (!r.ok) {
    return NextResponse.json(
      { error: j?.error || `Sync failed HTTP ${r.status}`, details: j ?? null },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, result: j });
}

// ✅ Soportar ambos métodos para evitar 405 según cómo lo llame el front
export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await run(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
