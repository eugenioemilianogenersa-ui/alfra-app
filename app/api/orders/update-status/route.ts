import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Estado =
  | "pendiente"
  | "en_preparacion"
  | "listo_para_entregar"
  | "enviado"
  | "entregado"
  | "cancelado";

const ESTADOS: Estado[] = [
  "pendiente",
  "en_preparacion",
  "listo_para_entregar",
  "enviado",
  "entregado",
  "cancelado",
];

const TRANSICIONES: Record<Estado, Estado[]> = {
  pendiente: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo_para_entregar", "cancelado"],
  listo_para_entregar: ["enviado", "cancelado"],
  enviado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

function normEstado(v: unknown): Estado | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return ESTADOS.includes(s as Estado) ? (s as Estado) : null;
}

function normSource(v: unknown): string {
  if (typeof v !== "string") return "API";
  const s = v.trim();
  if (!s) return "API";
  if (["APP_ADMIN", "APP_DELIVERY", "FUDO", "API"].includes(s)) return s;
  return "API";
}

type Body = {
  orderId?: number | string;
  estado?: string;
  source?: string;
};

type CookiesToSetItem = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;

    const id = Number(body?.orderId);
    const nextEstado = normEstado(body?.estado);
    const source = normSource(body?.source);

    if (!id || !Number.isFinite(id) || !nextEstado) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Auth SSR (evita el crash de auth-helpers en route handlers)
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet: CookiesToSetItem[]) {
            cookiesToSet.forEach((c) => {
              res.cookies.set(c.name, c.value, c.options);
            });
          },
        },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = userData.user;

    // Rol desde profiles
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profErr || !prof?.role) {
      return NextResponse.json({ error: "Forbidden (sin rol)" }, { status: 403 });
    }

    const role = String(prof.role).toUpperCase();
    const isAdmin = role === "ADMIN";
    const isDelivery = role === "DELIVERY";
    if (!isAdmin && !isDelivery) {
      return NextResponse.json({ error: "Forbidden (rol)" }, { status: 403 });
    }

    // Estado actual (service role)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, estado")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const currentEstado = normEstado(order.estado) ?? "pendiente";

    // Delivery: debe estar asignado en deliveries y solo puede ENVIADO/ENTREGADO
    if (isDelivery) {
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("deliveries")
        .select("id")
        .eq("order_id", id)
        .eq("delivery_user_id", user.id)
        .maybeSingle();

      if (linkErr || !link) {
        return NextResponse.json({ error: "Forbidden (no asignado)" }, { status: 403 });
      }

      if (!["enviado", "entregado"].includes(nextEstado)) {
        return NextResponse.json({ error: "Forbidden (estado)" }, { status: 403 });
      }
    }

    // Anti-rollback (transiciones)
    const allowed = TRANSICIONES[currentEstado] ?? [];
    if (!allowed.includes(nextEstado)) {
      return NextResponse.json(
        { error: "Transición inválida", current: currentEstado, next: nextEstado },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        estado: nextEstado,
        estado_source: source,
        estado_updated_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (updErr) {
      console.error("update-status error:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, orderId: id, estado: nextEstado });
  } catch (e) {
    console.error("update-status fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
