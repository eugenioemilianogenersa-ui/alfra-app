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

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminStaff(req);
    if (!guard.ok) return guard.res;

    const { data: cfg } = await supabaseAdmin
      .from("stamps_config")
      .select("voucher_type_id")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    const { data: rows, error } = await supabaseAdmin
      .from("voucher_types")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      currentStampsVoucherTypeId: cfg?.voucher_type_id ?? null,
      rows: rows || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminStaff(req);
    if (!guard.ok) return guard.res;

    const body = (await req.json().catch(() => null)) as any;

    const title = String(body?.title || "").trim();
    if (!title) return NextResponse.json({ error: "title requerido" }, { status: 400 });

    const slugIn = body?.slug ? String(body.slug).trim() : "";
    const slug = slugIn ? toSlug(slugIn) : toSlug(title);

    const payload = {
      slug,
      title,
      description: body?.description ? String(body.description).trim() : null,
      benefit_type: sanitizeBenefitType(body?.benefit_type),
      benefit_value: body?.benefit_value == null || body?.benefit_value === "" ? null : Number(body.benefit_value),
      currency: body?.currency ? String(body.currency).trim() : "ARS",
      conditions: body?.conditions ? String(body.conditions).trim() : null,
      expires_in_days: body?.expires_in_days == null || body?.expires_in_days === "" ? null : Number(body.expires_in_days),
      enabled: body?.enabled === false ? false : true,
    };

    if (payload.benefit_value != null && Number.isNaN(payload.benefit_value)) {
      return NextResponse.json({ error: "benefit_value inválido" }, { status: 400 });
    }
    if (payload.expires_in_days != null && (Number.isNaN(payload.expires_in_days) || payload.expires_in_days < 0)) {
      return NextResponse.json({ error: "expires_in_days inválido" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("voucher_types")
      .insert(payload)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
