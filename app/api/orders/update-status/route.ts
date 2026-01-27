// C:\Dev\alfra-app\app\api\orders\update-status\route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyStamp, revokeStampByRef, getStampConfig } from "@/lib/stampsEngine";
import { revokeLoyaltyPointsByRef } from "@/lib/loyaltyPointsEngine";

type Estado =
  | "pendiente"
  | "en preparación"
  | "listo para entregar"
  | "enviado"
  | "entregado"
  | "cancelado";

const ESTADOS: Estado[] = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
];

const TRANSICIONES: Record<Estado, Estado[]> = {
  pendiente: ["en preparación", "cancelado"],
  "en preparación": ["listo para entregar", "cancelado"],
  "listo para entregar": ["enviado", "cancelado"],
  enviado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

function normEstado(v: unknown): Estado | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();

  const normalized =
    s === "en_preparacion" || s === "en preparacion"
      ? "en preparación"
      : s === "listo_para_entregar" || s === "listo para entregar"
        ? "listo para entregar"
        : s;

  return ESTADOS.includes(normalized as Estado) ? (normalized as Estado) : null;
}

function normSource(v: unknown): string {
  if (typeof v !== "string") return "API";
  const s = v.trim();
  if (!s) return "API";
  if (["APP_ADMIN", "APP_STAFF", "APP_DELIVERY", "FUDO", "API"].includes(s)) return s;
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

async function getUserFromCookie(req: NextRequest) {
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
          cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user, supabase };
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
    const body = (await req.json().catch(() => null)) as Body | null;

    const id = Number(body?.orderId);
    const nextEstado = normEstado(body?.estado);
    const source = normSource(body?.source);

    if (!id || !Number.isFinite(id) || !nextEstado) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // ✅ base dinámico (dominio actual)
    const base = new URL(req.url).origin;

    // Auth: cookie o bearer
    const cookieAuth = await getUserFromCookie(req);
    const bearerAuth = cookieAuth ? null : await getUserFromBearer(req);
    const authCtx = cookieAuth || bearerAuth;

    if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, supabase } = authCtx;

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
    const isStaff = role === "STAFF";
    const isDelivery = role === "DELIVERY";

    if (!isAdmin && !isStaff && !isDelivery) {
      return NextResponse.json({ error: "Forbidden (rol)" }, { status: 403 });
    }

    // Estado actual + data necesaria (service role)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, estado, user_id, monto, source, external_id, fudo_id")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const currentEstado = normEstado(order.estado) ?? "pendiente";

    // Idempotente
    if (currentEstado === nextEstado) {
      return NextResponse.json({ ok: true, orderId: id, estado: nextEstado, noop: true });
    }

    // Delivery: debe estar asignado y solo puede enviado/entregado
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

    // Anti-rollback SOLO para NO-ADMIN
    if (!isAdmin) {
      const allowed = TRANSICIONES[currentEstado] ?? [];
      if (!allowed.includes(nextEstado)) {
        return NextResponse.json(
          { error: "Transición inválida", current: currentEstado, next: nextEstado },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();

    // Update order
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

    // Auditoría (si existe tabla)
    try {
      await supabaseAdmin.from("order_status_log").insert({
        order_id: id,
        estado_from: currentEstado,
        estado_to: nextEstado,
        actor_user_id: user.id,
        actor_role: role,
        source,
        metadata: { actor_user_id: user.id, actor_role: role, source, admin_override: isAdmin },
      });
    } catch {
      // noop
    }

    // ✅ PUNTOS: al cancelar, revocar SOLO por sale:<id> (evita duplicar)
    try {
      if (nextEstado === "cancelado" && order?.user_id) {
        const userIdForPoints = String(order.user_id);
        const saleId = String(order.external_id || order.fudo_id || "");

        if (saleId) {
          await revokeLoyaltyPointsByRef({
            userId: userIdForPoints,
            source: "FUDO",
            refType: "order_id",
            refId: `sale:${saleId}`,
            revokedBy: user.id,
            revokedReason: "order_cancelled",
          });
        }
      }
    } catch (e) {
      console.warn("points revoke skipped:", e);
    }

    // ✅ SELLOS (APP) (igual que tenías)
    try {
      const cfg = await getStampConfig().catch(() => null);

      if (cfg?.enabled && order?.user_id) {
        const orderIdRef = String(id);
        const userIdForStamp = String(order.user_id);
        const monto = Number(order.monto ?? 0);

        if (nextEstado === "cancelado") {
          await revokeStampByRef({
            source: "APP",
            refType: "order_id",
            refId: orderIdRef,
            revokedBy: user.id,
            revokedReason: "order_cancelled",
          });
        } else {
          const grantOn = String(cfg.grant_on_estado || "entregado");
          if (nextEstado === grantOn) {
            const a = await applyStamp({
              userId: userIdForStamp,
              source: "APP",
              refType: "order_id",
              refId: orderIdRef,
              amount: monto,
            });

            if ((a as any)?.applied === true) {
              await fetch(`${base}/api/push/notify-stamps`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ userId: userIdForStamp }),
              }).catch(() => null);
            }
          }
        }
      }
    } catch (e) {
      console.warn("stamps hook skipped:", e);
    }

    return NextResponse.json({ ok: true, orderId: id, estado: nextEstado });
  } catch (e) {
    console.error("update-status fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
