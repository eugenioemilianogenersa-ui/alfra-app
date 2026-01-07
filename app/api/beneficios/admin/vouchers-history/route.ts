import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function GET(req: Request) {
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

    // Historial beneficios (últimos 100)
    const { data, error } = await supabaseAdmin
      .from("beneficios_redemptions")
      .select(
        `
        id,
        redeemed_at,
        redeemed_by,
        redeemed_channel,
        redeemed_presenter,
        redeemed_note,
        voucher:beneficios_vouchers!beneficios_redemptions_voucher_id_fkey (
          id,
          voucher_code,
          status,
          created_at,
          used_at,
          user_id,
          beneficio:beneficios (
            title
          )
        )
      `
      )
      .order("redeemed_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });

    // Traer profiles de dueños (titular/teléfono)
    const ownerIds = Array.from(
      new Set(
        (data ?? [])
          .map((r: any) => r?.voucher?.user_id)
          .filter(Boolean)
      )
    ) as string[];

    let ownersMap = new Map<string, { display_name: string | null; phone_normalized: string | null }>();
    if (ownerIds.length > 0) {
      const { data: owners } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, phone_normalized")
        .in("id", ownerIds);

      (owners ?? []).forEach((o: any) => {
        ownersMap.set(String(o.id), {
          display_name: o.display_name ?? null,
          phone_normalized: o.phone_normalized ?? null,
        });
      });
    }

    const rows = (data ?? []).map((r: any) => {
      const v = r.voucher || {};
      const owner = ownersMap.get(String(v.user_id || "")) || { display_name: null, phone_normalized: null };

      return {
        id: String(r.id),
        code: String(v.voucher_code || ""),
        status: String(v.status || ""),
        reward_name: String(v?.beneficio?.title || "Beneficio"),
        issued_at: v.created_at ?? null,
        expires_at: null,
        redeemed_at: r.redeemed_at ?? v.used_at ?? null,
        redeemed_by: r.redeemed_by ?? null,
        redeemed_channel: r.redeemed_channel ?? null,
        redeemed_presenter: r.redeemed_presenter ?? null,
        redeemed_note: r.redeemed_note ?? null,
        user_id: v.user_id ?? null,
        profiles: owner,
      };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: e?.message || String(e) }, { status: 500 });
  }
}
