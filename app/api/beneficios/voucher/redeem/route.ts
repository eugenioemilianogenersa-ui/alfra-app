import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function normCode(raw: string) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function mapStatus(dbStatus?: string | null): "ISSUED" | "REDEEMED" | "NOT_FOUND" {
  const s = String(dbStatus || "").toLowerCase();
  if (s === "emitido") return "ISSUED";
  if (s === "canjeado") return "REDEEMED";
  return "NOT_FOUND";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "missing_auth" }, { status: 401 });

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) return NextResponse.json({ error: "invalid_auth" }, { status: 401 });

    const uid = userRes.user.id;

    // Admin/Staff only
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();

    if (pErr || !prof) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

    const role = String(prof.role || "").toLowerCase();
    if (!["admin", "staff"].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const code = normCode(body?.code);
    const redeemed_channel = body?.redeemed_channel ? String(body.redeemed_channel).slice(0, 40) : null;
    const redeemed_presenter = body?.redeemed_presenter ? String(body.redeemed_presenter).slice(0, 120) : null;
    const redeemed_note = body?.redeemed_note ? String(body.redeemed_note).slice(0, 400) : null;

    if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

    // Find voucher
    const { data: bv, error: vErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .select(
        `
        id,
        voucher_code,
        status,
        created_at,
        used_at,
        user_id,
        beneficios:beneficio_id ( title )
      `
      )
      .eq("voucher_code", code)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: "db_error", detail: vErr.message }, { status: 500 });
    if (!bv) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const current = String((bv as any).status || "").toLowerCase();
    if (current !== "emitido") {
      // ya canjeado o inválido
      return NextResponse.json(
        {
          error: "not_redeemable",
          result: {
            ok: true,
            kind: "beneficios",
            code: (bv as any).voucher_code,
            status: mapStatus((bv as any).status),
            reward_name: (bv as any)?.beneficios?.title ?? null,
            issued_at: (bv as any).created_at ?? null,
            expires_at: null,
            redeemed_at: (bv as any).used_at ?? null,
            redeemed_by: null,
            redeemed_channel: null,
            redeemed_presenter: null,
            redeemed_note: null,
            owner: null,
          },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // Update voucher -> canjeado
    const { data: upd, error: uErr } = await supabaseAdmin
      .from("beneficios_vouchers")
      .update({ status: "canjeado", used_at: now })
      .eq("id", (bv as any).id)
      .select(
        `
        id,
        voucher_code,
        status,
        created_at,
        used_at,
        user_id,
        beneficios:beneficio_id ( title )
      `
      )
      .single();

    if (uErr) return NextResponse.json({ error: "update_failed", detail: uErr.message }, { status: 500 });

    // Save trazabilidad (independiente, no toca tabla de vouchers)
    await supabaseAdmin.from("beneficios_redemptions").insert({
      voucher_id: (upd as any).id,
      redeemed_by: uid,
      redeemed_channel,
      redeemed_presenter,
      redeemed_note,
    });

    // owner
    const ownerId = (upd as any).user_id as string;
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("display_name, phone_normalized")
      .eq("id", ownerId)
      .maybeSingle();

    return NextResponse.json({
      result: {
        ok: true,
        kind: "beneficios",
        code: (upd as any).voucher_code,
        status: mapStatus((upd as any).status),
        reward_name: (upd as any)?.beneficios?.title ?? null,
        issued_at: (upd as any).created_at ?? null,
        expires_at: null,
        redeemed_at: (upd as any).used_at ?? null,
        redeemed_by: uid,
        redeemed_channel,
        redeemed_presenter,
        redeemed_note,
        owner: owner
          ? { display_name: owner.display_name ?? null, phone_normalized: owner.phone_normalized ?? null }
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: e?.message || String(e) }, { status: 500 });
  }
}
