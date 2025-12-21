import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStampConfig } from "@/lib/stampsEngine";

type CookiesToSetItem = { name: string; value: string; options: CookieOptions };

export async function GET() {
  const cfg = await getStampConfig();
  return NextResponse.json({ ok: true, config: cfg });
}

export async function POST(req: NextRequest) {
  try {
    const res = NextResponse.next();

    const supabase = createServerClient(
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

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    const role = String(prof?.role || "").toUpperCase();
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as any;
    const minAmount = Number(body?.min_amount);
    const grantOnEstado = String(body?.grant_on_estado || "").trim();

    if (!Number.isFinite(minAmount) || minAmount <= 0) {
      return NextResponse.json({ error: "min_amount inválido" }, { status: 400 });
    }

    const patch: any = { min_amount: minAmount, updated_at: new Date().toISOString() };
    if (grantOnEstado && ["enviado", "entregado"].includes(grantOnEstado)) {
      patch.grant_on_estado = grantOnEstado;
    }

    const { data: row, error: selErr } = await supabaseAdmin
      .from("stamps_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

    // si no existe, la creamos y luego actualizamos
    let cfgId = row?.id as string | undefined;
    if (!cfgId) {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("stamps_config")
        .insert({ min_amount: minAmount, daily_limit: 1, grant_on_estado: "entregado", enabled: true })
        .select("id")
        .single();

      if (insErr || !ins?.id) return NextResponse.json({ error: insErr?.message || "Insert config error" }, { status: 500 });
      cfgId = ins.id;
    }

    const { error: updErr } = await supabaseAdmin.from("stamps_config").update(patch).eq("id", cfgId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
