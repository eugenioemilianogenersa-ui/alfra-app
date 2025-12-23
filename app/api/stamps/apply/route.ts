import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyStamp } from "@/lib/stampsEngine";

type CookiesToSetItem = { name: string; value: string; options: CookieOptions };

type Body = {
  userId?: string;
  amount?: number;
  source?: "MANUAL" | "APP" | "FUDO";
  refType?: "manual" | "order_id";
  refId?: string;
  reason?: string;
};

async function getAuth(req: NextRequest) {
  const res = NextResponse.next();

  // cookie
  const supaCookie = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: CookiesToSetItem[]) =>
          cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options)),
      },
    }
  );

  const { data: cData } = await supaCookie.auth.getUser();
  if (cData?.user) return { user: cData.user };

  // bearer
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const supaBearer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data: bData } = await supaBearer.auth.getUser();
  if (!bData?.user) return null;

  return { user: bData.user };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth(req);
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Body | null;

    const userId = String(body?.userId || "");
    const refId = String(body?.refId || "");
    const amount = body?.amount ?? null;
    const source = String(body?.source || "MANUAL").toUpperCase();

    if (!userId || !refId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Solo MANUAL desde cliente
    if (source !== "MANUAL") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Solo ADMIN/STAFF
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .single();

    const role = String(prof?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const reason = String(body?.reason || "").trim();
    if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 });

    const result = await applyStamp({
      userId,
      source: "MANUAL",
      refType: "manual",
      refId,
      amount: amount === null ? null : Number(amount),
      createdBy: auth.user.id,
      reason,
    });

    if (result.ok === false) {
      return NextResponse.json({ error: "Monto menor al mínimo" }, { status: 400 });
    }

    // ✅ Push SOLO si realmente aplicó (no daily_limit, no dup)
    if ((result as any)?.applied === true) {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";
      await fetch(`${base}/api/push/notify-stamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
