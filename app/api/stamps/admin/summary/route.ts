import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as any;
    const userId = String(body?.userId || "");
    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

    const { data: wallet, error: wErr } = await supabaseAdmin
      .from("stamps_wallet")
      .select("current_stamps,lifetime_stamps,updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

    const { data: ledger, error: lErr } = await supabaseAdmin
      .from("stamps_ledger")
      .select("id,created_at,source,ref_type,ref_id,amount,status,reason,revoked_reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, wallet: wallet || { current_stamps: 0 }, ledger: ledger || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
