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
  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Solo ADMIN/STAFF
    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });

    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1) Traer vouchers canjeados
    const { data: vouchers, error: vErr } = await supabaseAdmin
      .from("stamps_vouchers")
      .select(
        "id, code, status, reward_name, issued_at, expires_at, redeemed_at, redeemed_by, redeemed_channel, redeemed_presenter, redeemed_note, user_id"
      )
      .eq("status", "REDEEMED")
      .order("redeemed_at", { ascending: false })
      .limit(100);

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const rows = vouchers || [];

    // 2) Traer perfiles por user_id (sin join)
    const userIds = Array.from(
      new Set(rows.map((r: any) => r.user_id).filter(Boolean))
    ) as string[];

    let profilesMap = new Map<string, { display_name: string | null; phone_normalized: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, phone_normalized")
        .in("id", userIds);

      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

      (profiles || []).forEach((p: any) => {
        profilesMap.set(p.id, {
          display_name: p.display_name ?? null,
          phone_normalized: p.phone_normalized ?? null,
        });
      });
    }

    // 3) Merge
    const merged = rows.map((r: any) => ({
      ...r,
      profiles: r.user_id ? profilesMap.get(r.user_id) || null : null,
    }));

    return NextResponse.json({ ok: true, rows: merged });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
