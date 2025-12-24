import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function genCode() {
  const p = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ALFRA-${p()}-${p()}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer "))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = auth.slice(7).trim();

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: u } = await supabaseUser.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rewardName = "1 Pinta Simple + Burguer Simple GRATIS";

    // 1️⃣ Descontar sellos (RPC con auth.uid)
    const { data: current, error: rpcErr } = await supabaseUser.rpc(
      "redeem_stamps_wallet",
      { p_used: 8 }
    );

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 409 });
    }

    // 2️⃣ Crear voucher con SERVICE ROLE (evita RLS)
    const code = genCode();
    const issuedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

    const { error: insErr } = await supabaseAdmin
      .from("stamps_vouchers")
      .insert({
        user_id: u.user.id,
        code,
        status: "ISSUED",
        reward_name: rewardName,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reward_name: rewardName,
      code,
      issued_at: issuedAt,
      expires_at: expiresAt,
      current_stamps: current,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
