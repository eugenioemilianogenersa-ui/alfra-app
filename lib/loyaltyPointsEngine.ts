// lib/loyaltyPointsEngine.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPointsPush } from "./push/sendPointsPush";

type LoyaltyConfig = {
  base_uc: number;
  inflation_factor: number;
  grant_on_estado: string;
  enabled: boolean;
};

async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  const { data, error } = await supabaseAdmin
    .from("loyalty_config")
    .select("base_uc, inflation_factor, grant_on_estado, enabled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { base_uc: 500, inflation_factor: 1.0, grant_on_estado: "entregado", enabled: true };
  }

  return {
    base_uc: Number(data?.base_uc ?? 500),
    inflation_factor: Number(data?.inflation_factor ?? 1.0),
    grant_on_estado: String(data?.grant_on_estado ?? "entregado"),
    enabled: Boolean(data?.enabled ?? true),
  };
}

function normalizeEstado(s: string) {
  return String(s || "").trim().toLowerCase();
}

function computePoints(amount: number, baseUC: number, factor: number) {
  const effectiveUC = Math.max(1, baseUC) * Math.max(1, factor);
  const points = Math.floor((Number(amount) || 0) / effectiveUC);
  return { points, effectiveUC };
}

async function upsertWalletAdd(userId: string, delta: number) {
  const { data: w, error: wErr } = await supabaseAdmin
    .from("loyalty_wallets")
    .select("points")
    .eq("user_id", userId)
    .maybeSingle();

  if (wErr) return { ok: false as const, error: wErr.message };

  const current = Number(w?.points || 0);
  const next = current + delta;

  const { error: upErr } = await supabaseAdmin.from("loyalty_wallets").upsert({
    user_id: userId,
    points: next,
    updated_at: new Date().toISOString(),
  });

  if (upErr) return { ok: false as const, error: upErr.message };

  return { ok: true as const, next };
}

async function insertEvent(params: {
  userId: string;
  delta: number;
  amount: number | null;
  refType: string;
  refId: string;
  reason: string;
  metadata: any;
  eventType: "earn" | "revoke" | "manual" | "redeem";
  source: "FUDO" | "APP" | "MANUAL" | "API";
}) {
  const { error: evErr } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: params.userId,
    delta: params.delta,
    reason: params.reason,
    event_type: params.eventType,
    source: params.source,
    ref_type: params.refType,
    ref_id: params.refId,
    amount: params.amount,
    metadata: params.metadata,
  });

  if (!evErr) return { ok: true as const };

  const msg = (evErr as any)?.message || "";
  const code = (evErr as any)?.code || "";
  if (code === "23505" || msg.toLowerCase().includes("duplicate")) {
    return { ok: false as const, duplicate: true as const };
  }

  return { ok: false as const, error: msg };
}

async function getEarnEventByRef(params: {
  userId: string;
  source: "FUDO" | "APP";
  refType: string;
  refId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("loyalty_events")
    .select("id, delta, amount, created_at, reason, metadata")
    .eq("user_id", params.userId)
    .eq("source", params.source)
    .eq("ref_type", params.refType)
    .eq("ref_id", params.refId)
    .eq("event_type", "earn")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: true as const, event: null as any };

  return { ok: true as const, event: data as any };
}

function pushReasonForFudoEarn() {
  return "Compra en Alfra";
}

function pushReasonForFudoRevoke() {
  return "Compra cancelada (reversa)";
}

/**
 * ✅ NUEVO: revocar puntos por referencia (reversa contable).
 * - Busca el earn original (misma ref)
 * - Inserta evento revoke (delta negativo)
 * - Actualiza wallet
 * - Idempotente (si ya revocó => duplicate => no-op)
 */
export async function revokeLoyaltyPointsByRef(params: {
  userId: string;
  source: "FUDO" | "APP";
  refType: string;
  refId: string;
  revokedBy?: string | null;
  revokedReason?: string | null;
}) {
  // 1) Buscar earn original
  const earn = await getEarnEventByRef({
    userId: params.userId,
    source: params.source,
    refType: params.refType,
    refId: params.refId,
  });

  if (!earn.ok) return { revoked: false, reason: "earn_lookup_error", error: (earn as any).error };

  if (!earn.event) {
    // No hay earn => nada que revertir
    return { revoked: false, reason: "no_earn_found" };
  }

  const earnedDelta = Number(earn.event.delta || 0);
  if (!Number.isFinite(earnedDelta) || earnedDelta <= 0) {
    return { revoked: false, reason: "invalid_earn_delta" };
  }

  const delta = -earnedDelta;

  // 2) Insertar evento revoke (idempotente por unique)
  const ins = await insertEvent({
    userId: params.userId,
    delta,
    amount: earn.event.amount ?? null,
    refType: params.refType,
    refId: params.refId,
    reason: params.revokedReason || "revoke_on_cancel",
    eventType: "revoke",
    source: params.source,
    metadata: {
      engine: "loyaltyPointsEngine",
      action: "revoke",
      revoked_by: params.revokedBy ?? null,
      revoked_reason: params.revokedReason ?? null,
      original_event_id: earn.event.id,
      original_reason: earn.event.reason ?? null,
      original_created_at: earn.event.created_at ?? null,
    },
  });

  if (!ins.ok) {
    if ((ins as any).duplicate) return { revoked: false, reason: "duplicate_revoke" };
    return { revoked: false, reason: "revoke_insert_error", error: (ins as any).error };
  }

  // 3) Actualizar wallet
  const w = await upsertWalletAdd(params.userId, delta);
  if (!w.ok) return { revoked: false, reason: "wallet_upsert_error", error: w.error };

  // 4) Push (solo si revocó realmente)
  try {
    if (params.source === "FUDO") {
      await sendPointsPush({
        userId: params.userId,
        delta,
        reason: pushReasonForFudoRevoke(),
        url: "/puntos",
      });
    }
  } catch (e) {
    console.error("revokeLoyaltyPointsByRef: push error:", e);
  }

  return { revoked: true, delta, next: w.next };
}

// ✅ Compat: order.id como ref
export async function applyLoyaltyPointsForOrder(params: {
  userId: string;
  orderId: string; // orders.id
  amount: number;
  estadoFinal: string;
}) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { applied: false, reason: "disabled" };

  const grantOn = normalizeEstado(cfg.grant_on_estado || "entregado");
  if (normalizeEstado(params.estadoFinal) !== grantOn) {
    return { applied: false, reason: "estado_not_grant" };
  }

  const baseUC = Math.max(1, Number(cfg.base_uc || 500));
  const factor = Math.max(1, Number(cfg.inflation_factor || 1.0));

  const amount = Number(params.amount || 0);
  const { points, effectiveUC } = computePoints(amount, baseUC, factor);

  if (!Number.isFinite(points) || points <= 0) {
    return { applied: false, reason: "no_points", points: 0, effectiveUC };
  }

  const ins = await insertEvent({
    userId: params.userId,
    delta: points,
    amount,
    refType: "order_id",
    refId: String(params.orderId),
    reason: "earn_from_fudo_order",
    eventType: "earn",
    source: "FUDO",
    metadata: {
      engine: "loyaltyPointsEngine",
      ref: "order",
      base_uc: baseUC,
      inflation_factor: factor,
      effective_uc: effectiveUC,
    },
  });

  if (!ins.ok) {
    if ((ins as any).duplicate) return { applied: false, reason: "duplicate", points, effectiveUC };
    return { applied: false, reason: "event_insert_error", error: (ins as any).error };
  }

  const w = await upsertWalletAdd(params.userId, points);
  if (!w.ok) return { applied: false, reason: "wallet_upsert_error", error: w.error };

  // Push SOLO si aplicó realmente
  try {
    await sendPointsPush({
      userId: params.userId,
      delta: points,
      reason: pushReasonForFudoEarn(),
      url: "/puntos",
    });
  } catch (e) {
    console.error("applyLoyaltyPointsForOrder: push error:", e);
  }

  return { applied: true, points, effectiveUC, next: w.next };
}

// ✅ Venta Fudo: ref_id = sale:<saleId>
export async function applyLoyaltyPointsForFudoSale(params: {
  userId: string;
  saleId: string;
  amount: number;
  estadoFinal: string; // esperamos "entregado"
  saleType?: string | null;
}) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { applied: false, reason: "disabled" };

  const grantOn = normalizeEstado(cfg.grant_on_estado || "entregado");
  if (normalizeEstado(params.estadoFinal) !== grantOn) {
    return { applied: false, reason: "estado_not_grant" };
  }

  const baseUC = Math.max(1, Number(cfg.base_uc || 500));
  const factor = Math.max(1, Number(cfg.inflation_factor || 1.0));

  const amount = Number(params.amount || 0);
  const { points, effectiveUC } = computePoints(amount, baseUC, factor);

  if (!Number.isFinite(points) || points <= 0) {
    return { applied: false, reason: "no_points", points: 0, effectiveUC };
  }

  const refId = `sale:${String(params.saleId)}`;

  const ins = await insertEvent({
    userId: params.userId,
    delta: points,
    amount,
    refType: "order_id",
    refId,
    reason: "earn_from_fudo_sale",
    eventType: "earn",
    source: "FUDO",
    metadata: {
      engine: "loyaltyPointsEngine",
      ref: "sale",
      sale_type: params.saleType ?? null,
      base_uc: baseUC,
      inflation_factor: factor,
      effective_uc: effectiveUC,
    },
  });

  if (!ins.ok) {
    if ((ins as any).duplicate) return { applied: false, reason: "duplicate", points, effectiveUC, refId };
    return { applied: false, reason: "event_insert_error", error: (ins as any).error };
  }

  const w = await upsertWalletAdd(params.userId, points);
  if (!w.ok) return { applied: false, reason: "wallet_upsert_error", error: w.error };

  // Push SOLO si aplicó realmente
  try {
    await sendPointsPush({
      userId: params.userId,
      delta: points,
      reason: pushReasonForFudoEarn(),
      url: "/puntos",
    });
  } catch (e) {
    console.error("applyLoyaltyPointsForFudoSale: push error:", e);
  }

  return { applied: true, points, effectiveUC, next: w.next, refId };
}
