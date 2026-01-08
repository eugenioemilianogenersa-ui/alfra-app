import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CookiesToSetItem = {
  name: string;
  value: string;
  options: CookieOptions;
};

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

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

  return { user: data.user, supabase };
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

  return { user: data.user, supabase };
}

export async function POST(req: NextRequest) {
  try {
    // Auth: cookie o bearer
    const cookieAuth = await getUserFromCookie(req);
    const bearerAuth = cookieAuth ? null : await getUserFromBearer(req);
    const authCtx = cookieAuth || bearerAuth;

    if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user } = authCtx;

    // Solo ADMIN/STAFF (service role para evitar RLS)
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const phoneNorm = normalizePhone(body?.phone);

    if (!phoneNorm) {
      return NextResponse.json({ error: "phone requerido" }, { status: 400 });
    }

    const { data: prof, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone_normalized")
      .eq("phone_normalized", phoneNorm)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      user: prof ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
