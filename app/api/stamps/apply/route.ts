import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyStamp } from "@/lib/stampsEngine";

type CookiesToSetItem = { name: string; value: string; options: CookieOptions };

async function getAuth(req: NextRequest) {
  const res = NextResponse.next();

  const byCookie = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: CookiesToSetItem[]) => cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options)),
      },
    }
  );

  const { data: cData } = await byCookie.auth.getUser();
  if (cData?.user) return { user: cData.user };

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const byBearer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: bData } = await byBearer.auth.getUser();
  if (!bData?.user) return null;

  return { user: bData.user };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth(req);
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as any;
    const userId = String(body?.userId || "");
    const amount = body?.amount ?? null;
    const source = String(body?.source || "MANUAL") as "FUDO" | "APP" | "MANUAL";
    const refType = String(body?.refType || "manual") as "order_id" | "manual";
    const refId = String(body?.refId || "");

    if (!userId || !refId) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });

    // Solo MANUAL requiere rol ADMIN/STAFF
    if (source === "MANUAL") {
      const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", auth.user.id).single();
      const role = String(prof?.role || "").toUpperCase();
      if (!["ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

      if (result.ok === false) return NextResponse.json({ error: "Monto menor al mínimo" }, { status: 400 });

      return NextResponse.json({ ok: true, result });
    }

    // Auto (FUDO/APP) lo usarán otros server routes con service role, no desde cliente.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
