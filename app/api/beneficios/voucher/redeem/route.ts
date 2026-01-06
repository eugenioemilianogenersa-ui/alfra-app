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
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
    }

    const uid = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

    // rol
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();

    if (pErr || !prof) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

    const role = String(prof.role || "cliente").toLowerCase();
    const isPrivileged = role === "admin" || role === "staff";
    if (!isPrivileged) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // Buscar voucher
    const { data: bv, error: vErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .select("id, voucher_code, status, used_at")
      .eq("voucher_code", code)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: "db_error", detail: vErr.message }, { status: 500 });
    if (!bv) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const status = String(bv.status || "").toLowerCase();

    // Idempotente / antifraude: solo canjea si está emitido
    if (status !== "emitido") {
      return NextResponse.json(
        { error: "not_redeemable", status: bv.status, used_at: bv.used_at },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .update({ status: "canjeado", used_at: nowIso })
      .eq("id", bv.id)
      .eq("status", "emitido") // anti race-condition
      .select("voucher_code, status, used_at")
      .single();

    if (upErr) {
      return NextResponse.json({ error: "db_error", detail: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, voucher: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
