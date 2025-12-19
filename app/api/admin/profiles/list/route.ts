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

    // rol por RPC (no depende de policies raras)
    const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 403 });

    const r = String(role || "cliente").toLowerCase();
    const isAdmin = r === "admin";
    const isStaff = r === "staff";
    if (!isAdmin && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, phone, role, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, profiles: data ?? [] });
  } catch (e) {
    console.error("profiles/list fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
