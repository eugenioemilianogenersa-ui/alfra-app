import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearer(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: u, error: uErr } = await supabaseUser.auth.getUser();
    if (uErr || !u?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const rewardName = String(body?.reward_name || "Premio").trim() || "Premio";

    const { data, error } = await supabaseUser.rpc("redeem_stamps_create_voucher", {
      p_reward_name: rewardName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // ✅ NORMALIZAR: RPC puede devolver array (set-returning function)
    const row: any = Array.isArray(data) ? data[0] : data;

    if (!row?.code) {
      return NextResponse.json(
        { error: "RPC devolvió respuesta inválida (sin code)." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: {
        code: String(row.code),
        issued_at: String(row.issued_at),
        expires_at: String(row.expires_at),
        current_stamps: Number(row.current_stamps ?? 0),
        reward_name: rewardName, // tu RPC no lo devuelve, lo fijamos acá
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
