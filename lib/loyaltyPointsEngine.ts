// lib/loyaltyPointsEngine.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function insertEarnEvent(params: {
  userId: string;
  delta: number;
  amount: number;
  refType: string;
  refId: string;
  reason: string;
  metadata: any;
}) {
  const { error: evErr } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: params.userId,
    delta: params.delta,
    reason: params.reason,
    event_type: "earn",
    source: "FUDO",
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

// ✅ (opcional) Se conserva para compatibilidad con tu lógica anterior (orders.id)
// Ya NO lo vamos a llamar desde fudo/sync en el “cambio mortal”.
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

  // Idempotencia: (source, ref_type, ref_id) con ref_id = orders.id
  const ins = await insertEarnEvent({
    userId: params.userId,
    delta: points,
    amount,
    refType: "order_id",
    refId: String(params.orderId),
    reason: "earn_from_fudo_order",
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

  return { applied: true, points, effectiveUC, next: w.next };
}

// ✅ NUEVO: para TODAS las ventas Fudo (mesa/mostrador/otros) usando ref_id = "sale:<saleId>"
// Esto copia el patrón real que ya tenés en stamps_ledger.
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

  // ✅ Igual que sellos: ref_id = sale:<id>
  const refId = `sale:${String(params.saleId)}`;

  // Mantengo ref_type = order_id para que sea consistente con tu stamps_ledger (que hoy lo usa así)
  const ins = await insertEarnEvent({
    userId: params.userId,
    delta: points,
    amount,
    refType: "order_id",
    refId,
    reason: "earn_from_fudo_sale",
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

  return { applied: true, points, effectiveUC, next: w.next, refId };
}
