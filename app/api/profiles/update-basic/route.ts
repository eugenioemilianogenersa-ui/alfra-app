import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CookiesToSetItem = { name: string; value: string; options: CookieOptions };

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
    const body = (await req.json().catch(() => null)) as
      | { userId?: string; display_name?: string; phone?: string }
      | null;

    const userId = String(body?.userId || "").trim();
    const display_name = String(body?.display_name || "").trim();
    const phone = String(body?.phone || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }
    if (!display_name || !phone) {
      return NextResponse.json({ error: "Nombre y teléfono son obligatorios" }, { status: 400 });
    }

    const cookieAuth = await getUserFromCookie(req);
    const bearerAuth = cookieAuth ? null : await getUserFromBearer(req);
    const authCtx = cookieAuth || bearerAuth;

    if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, supabase } = authCtx;

    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = String(prof?.role || "").toUpperCase();
    const isAdmin = role === "ADMIN";
    const isStaff = role === "STAFF";

    if (!isAdmin && !isStaff) {
      return NextResponse.json({ error: "Forbidden (rol)" }, { status: 403 });
    }

    // ✅ whitelist estricta: SOLO nombre + teléfono
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ display_name, phone })
      .eq("id", userId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("profiles/update-basic fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
