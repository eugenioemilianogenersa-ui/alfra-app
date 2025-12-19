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

    const body = (await req.json().catch(() => null)) as
      | { userId?: string; delta?: number; reason?: string; source?: string }
      | null;

    const userId = String(body?.userId || "").trim();
    const delta = Number(body?.delta);
    const reason = String(body?.reason || "").trim();
    const source = String(body?.source || "panel_puntos").trim();

    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    if (!Number.isFinite(delta) || delta === 0) return NextResponse.json({ error: "delta inválido" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Motivo obligatorio" }, { status: 400 });

    // saldo actual
    const { data: w, error: wErr } = await supabaseAdmin
      .from("loyalty_wallets")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

    const current = Number(w?.points || 0);
    const next = current + delta;

    // upsert wallet
    const { error: upErr } = await supabaseAdmin.from("loyalty_wallets").upsert({
      user_id: userId,
      points: next,
      updated_at: new Date().toISOString(),
    });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // actor id
    const { data: me } = await supabase.auth.getUser();
    const actorId = me?.user?.id || null;

    // evento (auditoría)
    const { error: evErr } = await supabaseAdmin.from("loyalty_events").insert({
      user_id: userId,
      delta,
      reason,
      metadata: {
        source,
        actor_id: actorId,
        actor_role: actorRole,
      },
    });

    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, userId, points: next });
  } catch (e) {
    console.error("adjust-points fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// si alguien hace GET, respondemos 405
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
