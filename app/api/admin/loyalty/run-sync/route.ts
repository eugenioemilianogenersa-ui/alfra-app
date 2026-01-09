import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseFromBearer(req);
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // rol por RPC
    const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 403 });

    const actorRole = String(role || "cliente").toLowerCase();
    const isAdmin = actorRole === "admin";
    const isStaff = actorRole === "staff";
    if (!isAdmin && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";

    // llamamos al endpoint ya existente (server->server)
    const r = await fetch(`${base}/api/loyalty/fudo-sync`, { method: "GET" });
    const json = await r.json().catch(() => ({} as any));

    if (!r.ok) return NextResponse.json({ error: json?.error || `Error ${r.status}` }, { status: 500 });

    return NextResponse.json({ ok: true, run_by: actorRole, result: json });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
