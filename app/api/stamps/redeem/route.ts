import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getTokenFromReq(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Cliente Supabase “user-context” con JWT del usuario
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: u, error: uErr } = await supabaseUser.auth.getUser();
    if (uErr || !u?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // reward fijo por ahora
    const rewardName = "1 Pinta Simple + Burguer Simple GRATIS";

    // RPC corre con auth.uid() del JWT → perfecto
    const { data: out, error } = await supabaseUser.rpc("redeem_stamps_create_voucher", {
      p_reward_name: rewardName,
    });

    if (error) {
      const msg = String(error.message || "Error");
      const status =
        msg.toLowerCase().includes("no alcanza") || msg.toLowerCase().includes("no wallet")
          ? 409
          : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    const row = Array.isArray(out) ? out[0] : out;

    return NextResponse.json({
      ok: true,
      reward_name: rewardName,
      code: row.code,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      current_stamps: row.current_stamps,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
