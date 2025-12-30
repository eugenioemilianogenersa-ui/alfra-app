import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Soft rate limit (in-memory, best-effort)
const RL_WINDOW_MS = 3_000; // 3s por admin

type RLStore = Map<string, number>;
const rlStore: RLStore =
  (globalThis as any).__alfra_rl_admin_redeem || new Map<string, number>();
(globalThis as any).__alfra_rl_admin_redeem = rlStore;

function rateLimit(key: string, windowMs: number) {
  const now = Date.now();
  const last = rlStore.get(key) || 0;
  const diff = now - last;
  if (diff < windowMs) {
    return { ok: false, retryAfterMs: windowMs - diff };
  }
  rlStore.set(key, now);
  return { ok: true, retryAfterMs: 0 };
}

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
    const meUser = await getUserFromBearer(req);
    if (!meUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ rate limit por admin
    const rl = rateLimit(`admin:${meUser.id}`, RL_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiados intentos. Probá en ${(rl.retryAfterMs / 1000).toFixed(0)}s.` },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    // ADMIN/STAFF
    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", meUser.id)
      .maybeSingle();

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });

    const role = String(me?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as any;

    const code = normCode(body?.code);
    if (!code) return NextResponse.json({ error: "code requerido" }, { status: 400 });

    const redeemed_channel = String(body?.redeemed_channel || "CAJA").trim() || "CAJA";
    const redeemed_presenter = String(body?.redeemed_presenter || "").trim();
    const redeemed_note = String(body?.redeemed_note || "").trim();

    // Buscar voucher
    const { data: v, error: vErr } = await supabaseAdmin
      .from("stamps_vouchers")
      .select(
        "id, user_id, code, status, reward_name, issued_at, expires_at, redeemed_at, redeemed_by, redeemed_channel, redeemed_presenter, redeemed_note"
      )
      .eq("code", code)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    if (!v?.id) {
      return NextResponse.json(
        { ok: true, result: { ok: false, code, status: "NOT_FOUND" } },
        { status: 200 }
      );
    }

    const now = new Date();
    const exp = v.expires_at ? new Date(v.expires_at) : null;

    if (exp && exp.getTime() < now.getTime()) {
      return NextResponse.json(
        {
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
          },
        },
        { status: 200 }
      );
    }

    const st = String(v.status || "").toUpperCase();
    if (st !== "ISSUED") {
      return NextResponse.json(
        {
          ok: true,
          result: {
            ok: false,
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
          },
        },
        { status: 200 }
      );
    }

    const redeemedAt = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("stamps_vouchers")
      .update({
        status: "REDEEMED",
        redeemed_at: redeemedAt,
        redeemed_by: meUser.id,
        redeemed_channel,
        redeemed_presenter: redeemed_presenter || null,
        redeemed_note: redeemed_note || null,
        updated_at: redeemedAt,
      })
      .eq("id", v.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("display_name, phone_normalized")
      .eq("id", v.user_id)
      .maybeSingle();

    return NextResponse.json(
      {
        ok: true,
        result: {
          ok: true,
          code: v.code,
          status: "REDEEMED",
          reward_name: v.reward_name,
          issued_at: v.issued_at,
          expires_at: v.expires_at,
          redeemed_at: redeemedAt,
          redeemed_by: meUser.id,
          redeemed_channel,
          redeemed_presenter: redeemed_presenter || null,
          redeemed_note: redeemed_note || null,
          owner: owner
            ? {
                display_name: owner.display_name ?? null,
                phone_normalized: owner.phone_normalized ?? null,
              }
            : null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
