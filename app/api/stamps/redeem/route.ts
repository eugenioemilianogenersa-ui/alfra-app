import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getTokenFromReq(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function part4() {
  // 4 chars alfanuméricos en mayúscula
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function generateVoucherCode() {
  return `ALFRA-${part4()}-${part4()}`;
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Supabase con contexto de usuario (JWT)
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

    const userId = u.user.id;

    const rewardName = "1 Pinta Simple + Burguer Simple GRATIS";
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 días

    // 1) Descontar sellos (atómico en DB)
    // Requiere que exista la función SQL: redeem_stamps_wallet(p_used int)
    const { data: newStamps, error: decErr } = await supabaseUser.rpc("redeem_stamps_wallet", {
      p_used: 8,
    });

    if (decErr) {
      const msg = String(decErr.message || "Error");
      const status = msg.toLowerCase().includes("insufficient") ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    // 2) Registrar redención (histórico)
    await supabaseUser.from("stamps_redemptions").insert({
      user_id: userId,
      stamps_used: 8,
      created_by: userId,
      created_at: issuedAt.toISOString(),
    });

    // 3) Crear voucher con código único (retry por UNIQUE)
    let code = "";
    for (let i = 0; i < 8; i++) {
      const tryCode = generateVoucherCode();

      const { error: vErr } = await supabaseUser.from("stamps_vouchers").insert({
        user_id: userId,
        code: tryCode,
        status: "ISSUED",
        reward_name: rewardName,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: issuedAt.toISOString(),
        meta: {},
      });

      if (!vErr) {
        code = tryCode;
        break;
      }

      // unique violation postgres
      if ((vErr as any)?.code === "23505") continue;

      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    if (!code) return NextResponse.json({ error: "No se pudo generar voucher" }, { status: 500 });

    return NextResponse.json({
      ok: true,
      reward_name: rewardName,
      code,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      current_stamps: Number(newStamps ?? 0) || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
