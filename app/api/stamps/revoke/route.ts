import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revokeStampByRef } from "@/lib/stampsEngine";

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

    const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", auth.user.id).single();
    const role = String(prof?.role || "").toUpperCase();
    if (!["ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as any;
    const source = String(body?.source || "");
    const refType = String(body?.refType || "");
    const refId = String(body?.refId || "");
    const reason = String(body?.reason || "").trim();

    if (!source || !refType || !refId || !reason) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const result = await revokeStampByRef({
      source: source as any,
      refType: refType as any,
      refId,
      revokedBy: auth.user.id,
      revokedReason: reason,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
