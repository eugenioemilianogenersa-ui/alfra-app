import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user, supabase };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserFromBearer(req);
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as any;
    const code = normCode(body?.code);

    if (!code) return NextResponse.json({ error: "code requerido" }, { status: 400 });

    // Ejecuta RPC con el token del staff/admin (auth.uid disponible en la función)
    const { data, error } = await auth.supabase.rpc("redeem_voucher_by_code", { p_code: code });

    if (error) {
      const msg = String(error.message || "Error");
      const status = msg.toLowerCase().includes("forbidden") ? 403 : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({ ok: true, result: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
