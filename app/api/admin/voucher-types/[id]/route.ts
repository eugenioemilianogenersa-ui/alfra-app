import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function requireAdminStaff(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: me, error: meErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr) return { ok: false as const, res: NextResponse.json({ error: meErr.message }, { status: 500 }) };

  const role = String(me?.role || "").toUpperCase();
  if (!["ADMIN", "STAFF"].includes(role)) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

function sanitizeBenefitType(raw: any) {
  const v = String(raw || "custom").trim().toLowerCase();
  const allowed = new Set(["custom", "fixed_amount", "percent", "free_item"]);
  return allowed.has(v) ? v : "custom";
}

function toSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdminStaff(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as any;

    // si pidieron setear default para sellos
    if (body?.setActiveForStamps === true) {
      // solo permite setear si el tipo existe y está enabled
      const { data: vt, error: vtErr } = await supabaseAdmin
        .from("voucher_types")
        .select("id, enabled")
        .eq("id", id)
        .maybeSingle();

      if (vtErr) return NextResponse.json({ error: vtErr.message }, { status: 500 });
      if (!vt?.id) return NextResponse.json({ error: "voucher type no encontrado" }, { status: 404 });
      if (!vt.enabled) return NextResponse.json({ error: "voucher type deshabilitado" }, { status: 400 });

      const { data: cfg, error: cfgErr } = await supabaseAdmin
        .from("stamps_config")
        .select("id")
        .eq("enabled", true)
        .limit(1)
        .maybeSingle();

      if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
      if (!cfg?.id) return NextResponse.json({ error: "no hay stamps_config activa" }, { status: 400 });

      const { error: upErr } = await supabaseAdmin
        .from("stamps_config")
        .update({ voucher_type_id: id, updated_at: new Date().toISOString() })
        .eq("id", cfg.id);

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      return NextResponse.json({ ok: true });
    }

    // update normal (whitelist)
    const patch: any = {};

    if (body?.slug !== undefined) {
      const s = String(body.slug || "").trim();
      patch.slug = s ? toSlug(s) : null;
    }
    if (body?.title !== undefined) {
      const t = String(body.title || "").trim();
      if (!t) return NextResponse.json({ error: "title requerido" }, { status: 400 });
      patch.title = t;
    }
    if (body?.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body?.benefit_type !== undefined) patch.benefit_type = sanitizeBenefitType(body.benefit_type);

    if (body?.benefit_value !== undefined) {
      if (body.benefit_value == null || body.benefit_value === "") patch.benefit_value = null;
      else {
        const n = Number(body.benefit_value);
        if (Number.isNaN(n)) return NextResponse.json({ error: "benefit_value inválido" }, { status: 400 });
        patch.benefit_value = n;
      }
    }

    if (body?.currency !== undefined) patch.currency = body.currency ? String(body.currency).trim() : "ARS";
    if (body?.conditions !== undefined) patch.conditions = body.conditions ? String(body.conditions).trim() : null;

    if (body?.expires_in_days !== undefined) {
      if (body.expires_in_days == null || body.expires_in_days === "") patch.expires_in_days = null;
      else {
        const n = Number(body.expires_in_days);
        if (Number.isNaN(n) || n < 0) return NextResponse.json({ error: "expires_in_days inválido" }, { status: 400 });
        patch.expires_in_days = Math.floor(n);
      }
    }

    if (body?.enabled !== undefined) patch.enabled = !!body.enabled;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nada para actualizar" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("voucher_types")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "voucher type no encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
