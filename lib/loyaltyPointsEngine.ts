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
    // fallback seguro
    return { base_uc: 500, inflation_factor: 1.0, grant_on_estado: "entregado", enabled: true };
  }

  return {
    base_uc: Number(data?.base_uc ?? 500),
    inflation_factor: Number(data?.inflation_factor ?? 1.0),
    grant_on_estado: String(data?.grant_on_estado ?? "entregado"),
    enabled: Boolean(data?.enabled ?? true),
  };
}

export async function applyLoyaltyPointsForOrder(params: {
  userId: string;
  orderId: string;         // orders.id (string)
  amount: number;          // monto
  estadoFinal: string;     // estado final del pedido
}) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { applied: false, reason: "disabled" };

  const grantOn = String(cfg.grant_on_estado || "entregado").toLowerCase();
  if (String(params.estadoFinal).toLowerCase() !== grantOn) {
    return { applied: false, reason: "estado_not_grant" };
  }

  const baseUC = Math.max(1, Number(cfg.base_uc || 500));
  const factor = Math.max(1, Number(cfg.inflation_factor || 1.0));
  const effectiveUC = baseUC * factor;

  const amount = Number(params.amount || 0);
  const points = Math.floor(amount / effectiveUC);

  if (!Number.isFinite(points) || points <= 0) {
    return { applied: false, reason: "no_points", points: 0, effectiveUC };
  }

  // 1) Insert evento "earn" (idempotente por índice UNIQUE parcial)
  const { error: evErr } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: params.userId,
    delta: points,
    reason: "earn_from_fudo_order",
    event_type: "earn",
    source: "FUDO",
    ref_type: "order_id",
    ref_id: String(params.orderId),
    amount,
    metadata: {
      engine: "loyaltyPointsEngine",
      base_uc: baseUC,
      inflation_factor: factor,
      effective_uc: effectiveUC,
    },
  });

  // Si ya existe por UNIQUE => no aplicar de nuevo
  if (evErr) {
    // Postgres unique violation code
    // En Supabase suele venir como message; cubrimos ambos casos.
    const msg = (evErr as any)?.message || "";
    const code = (evErr as any)?.code || "";
    if (code === "23505" || msg.toLowerCase().includes("duplicate")) {
      return { applied: false, reason: "duplicate", points, effectiveUC };
    }
    return { applied: false, reason: "event_insert_error", error: msg };
  }

  // 2) Actualizar wallet (upsert con suma segura)
  const { data: w, error: wErr } = await supabaseAdmin
    .from("loyalty_wallets")
    .select("points")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (wErr) {
    return { applied: false, reason: "wallet_read_error", error: wErr.message };
  }

  const current = Number(w?.points || 0);
  const next = current + points;

  const { error: upErr } = await supabaseAdmin.from("loyalty_wallets").upsert({
    user_id: params.userId,
    points: next,
    updated_at: new Date().toISOString(),
  });

  if (upErr) {
    return { applied: false, reason: "wallet_upsert_error", error: upErr.message };
  }

  return { applied: true, points, effectiveUC, next };
}
