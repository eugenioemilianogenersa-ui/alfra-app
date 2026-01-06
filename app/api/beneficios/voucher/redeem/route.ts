import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "missing_auth" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) return NextResponse.json({ error: "invalid_auth" }, { status: 401 });

    const uid = userRes.user.id;

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();

    if (pErr || !prof) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

    const role = String(prof.role || "").toLowerCase();
    if (role !== "admin" && role !== "staff") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const code = String(body?.code || "").trim();
    if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

    // Marcar canjeado solo si está emitido
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .update({
        status: "canjeado",
        used_at: new Date().toISOString(),
      })
      .eq("voucher_code", code)
      .eq("status", "emitido")
      .select("voucher_code,status,used_at")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ error: "db_error", detail: uErr.message }, { status: 500 });
    }

    if (!updated) {
      // puede ser: no existe, o ya estaba canjeado, o no estaba emitido
      const { data: exists } = await supabaseAdmin
        .from("beneficios_vouchers")
        .select("voucher_code,status,used_at")
        .eq("voucher_code", code)
        .maybeSingle();

      if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ error: "not_redeemable", current: exists }, { status: 409 });
    }

    return NextResponse.json({ ok: true, voucher: updated });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: e?.message || String(e) }, { status: 500 });
  }
}
