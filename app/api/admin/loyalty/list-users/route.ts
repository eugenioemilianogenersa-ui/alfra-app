import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function supabaseFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseFromBearer(req);
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 403 });

    const r = String(role || "cliente").toLowerCase();
    const isAdmin = r === "admin";
    const isStaff = r === "staff";
    if (!isAdmin && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email")
      .order("created_at", { ascending: false });

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: wallets, error: wErr } = await supabaseAdmin
      .from("loyalty_wallets")
      .select("user_id, points")
      .in("user_id", ids);

    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

    const map = new Map<string, number>();
    (wallets ?? []).forEach((w: any) => map.set(w.user_id, Number(w.points || 0)));

    const result = (profiles ?? []).map((p: any) => ({
      id: p.id,
      display_name: p.display_name || "Sin nombre",
      email: p.email || "",
      points: map.get(p.id) ?? 0,
    }));

    return NextResponse.json({ ok: true, users: result });
  } catch (e) {
    console.error("loyalty/list-users fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}