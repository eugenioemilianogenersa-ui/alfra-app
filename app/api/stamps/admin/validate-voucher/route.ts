import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

async function getUserFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ADMIN/STAFF
    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });

    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const code = normCode(body?.code);
    if (!code) return NextResponse.json({ error: "code requerido" }, { status: 400 });

    const { data: v, error: vErr } = await supabaseAdmin
      .from("stamps_vouchers")
      .select(
        "id, user_id, code, status, reward_name, issued_at, expires_at, redeemed_at, redeemed_by, redeemed_channel, redeemed_presenter, redeemed_note"
      )
      .eq("code", code)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    if (!v?.id) {
      return NextResponse.json({ ok: true, result: { ok: false, code, status: "NOT_FOUND" } });
    }

    const now = new Date();
    const exp = v.expires_at ? new Date(v.expires_at) : null;

    // titular
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("display_name, phone_normalized")
      .eq("id", v.user_id)
      .maybeSingle();

    if (exp && exp.getTime() < now.getTime()) {
      return NextResponse.json({
        ok: true,
        result: {
          ok: false,
          code: v.code,
          status: "EXPIRED",
          reward_name: v.reward_name,
          issued_at: v.issued_at,
          expires_at: v.expires_at,
          redeemed_at: v.redeemed_at,
          redeemed_by: v.redeemed_by,
          redeemed_channel: v.redeemed_channel,
          redeemed_presenter: v.redeemed_presenter,
          redeemed_note: v.redeemed_note,
          owner: owner
            ? { display_name: owner.display_name ?? null, phone_normalized: owner.phone_normalized ?? null }
            : null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      result: {
        ok: String(v.status).toUpperCase() === "ISSUED",
        code: v.code,
        status: v.status,
        reward_name: v.reward_name,
        issued_at: v.issued_at,
        expires_at: v.expires_at,
        redeemed_at: v.redeemed_at,
        redeemed_by: v.redeemed_by,
        redeemed_channel: v.redeemed_channel,
        redeemed_presenter: v.redeemed_presenter,
        redeemed_note: v.redeemed_note,
        owner: owner
          ? { display_name: owner.display_name ?? null, phone_normalized: owner.phone_normalized ?? null }
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
