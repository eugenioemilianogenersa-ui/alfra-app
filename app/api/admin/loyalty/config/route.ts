import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function supabaseFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function requireAdminOrStaff(req: NextRequest) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) return { ok: false as const, status: 401, error: "Unauthorized", supabase: null };

  const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
  if (roleErr) return { ok: false as const, status: 403, error: roleErr.message, supabase };

  const actorRole = String(role || "cliente").toLowerCase();
  const isAdmin = actorRole === "admin";
  const isStaff = actorRole === "staff";
  if (!isAdmin && !isStaff) return { ok: false as const, status: 403, error: "Forbidden", supabase };

  return { ok: true as const, actorRole, isAdmin, isStaff, supabase };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminOrStaff(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabaseAdmin
    .from("loyalty_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: data ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminOrStaff(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // edición solo admin
  if (!auth.isAdmin) return NextResponse.json({ error: "Solo admin puede editar" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { base_uc?: number; inflation_factor?: number; grant_on_estado?: string; enabled?: boolean }
    | null;

  const base_uc = Number(body?.base_uc);
  const inflation_factor = Number(body?.inflation_factor);
  const grant_on_estado = String(body?.grant_on_estado || "entregado").trim();
  const enabled = Boolean(body?.enabled);

  if (!Number.isFinite(base_uc) || base_uc < 1) {
    return NextResponse.json({ error: "base_uc inválido (>= 1)" }, { status: 400 });
  }

  if (!Number.isFinite(inflation_factor) || inflation_factor < 1) {
    return NextResponse.json({ error: "inflation_factor inválido (>= 1.00)" }, { status: 400 });
  }

  if (!grant_on_estado) {
    return NextResponse.json({ error: "grant_on_estado requerido" }, { status: 400 });
  }

  // update a la última fila (o insert si no existe)
  const { data: last, error: lastErr } = await supabaseAdmin
    .from("loyalty_config")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) return NextResponse.json({ error: lastErr.message }, { status: 500 });

  if (!last?.id) {
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("loyalty_config")
      .insert({
        base_uc,
        inflation_factor,
        grant_on_estado,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, config: ins });
  }

  const { data: upd, error: updErr } = await supabaseAdmin
    .from("loyalty_config")
    .update({
      base_uc,
      inflation_factor,
      grant_on_estado,
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", last.id)
    .select()
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: upd });
}
