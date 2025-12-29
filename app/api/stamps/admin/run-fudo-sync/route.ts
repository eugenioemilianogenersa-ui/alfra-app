import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getUserFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user, token };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserFromBearer(req);
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();

    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";
    const key = process.env.INTERNAL_STAMPS_SYNC_KEY || "";

    const url = key
      ? `${base}/api/stamps/fudo-sync?key=${encodeURIComponent(key)}`
      : `${base}/api/stamps/fudo-sync`;

    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      return NextResponse.json({ error: j?.error || "Sync error" }, { status: r.status });
    }

    return NextResponse.json({ ok: true, result: j });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
