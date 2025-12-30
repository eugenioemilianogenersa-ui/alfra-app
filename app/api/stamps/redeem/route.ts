import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Soft rate limit (in-memory, best-effort)
const RL_WINDOW_MS = 10_000; // 10s por usuario

type RLStore = Map<string, number>;
const rlStore: RLStore =
  (globalThis as any).__alfra_rl_redeem || new Map<string, number>();
(globalThis as any).__alfra_rl_redeem = rlStore;

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

    // ✅ rate limit por usuario
    const rl = rateLimit(`user:${u.user.id}`, RL_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiados intentos. Probá en ${(rl.retryAfterMs / 1000).toFixed(0)}s.` },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    const body = (await req.json().catch(() => null)) as any;
    const rewardName = String(body?.reward_name || "Premio").trim() || "Premio";

    const { data, error } = await supabaseUser.rpc("redeem_stamps_create_voucher", {
      p_reward_name: rewardName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Normalizar: RPC puede devolver array
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
        reward_name: rewardName,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
