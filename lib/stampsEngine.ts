import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StampSource = "FUDO" | "APP" | "MANUAL";
type RefType = "order_id" | "manual";

function todayDateUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

export async function getStampConfig() {
  // singleton
  const { data, error } = await supabaseAdmin
    .from("stamps_config")
    .select("min_amount, daily_limit, grant_on_estado, enabled")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // si no existe aún, la creamos (auto-heal)
  if (!data) {
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("stamps_config")
      .insert({ min_amount: 5000, daily_limit: 1, grant_on_estado: "entregado", enabled: true })
      .select("min_amount, daily_limit, grant_on_estado, enabled")
      .single();
    if (insErr) throw new Error(insErr.message);
    return ins;
  }

  return data;
}

export async function ensureWallet(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("stamps_wallet")
    .select("user_id, current_stamps, lifetime_stamps")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) return data;

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("stamps_wallet")
    .insert({ user_id: userId })
    .select()
    .single();

  if (insErr) throw new Error(insErr.message);
  return ins;
}

export async function applyStamp(params: {
  userId: string;
  source: StampSource;
  refType: RefType;
  refId: string;
  amount?: number | null;
  createdBy?: string | null; // manual: admin/staff
  reason?: string | null;    // manual: motivo
  silentPush?: boolean;      // para futuro; default false
}) {
  const cfg = await getStampConfig();
  if (!cfg.enabled) return { ok: true, applied: false, reason: "disabled" as const };

  // Validación monto mínimo SOLO si viene amount (manual o si querés forzar)
  const amount = params.amount ?? null;
  if (amount !== null && Number.isFinite(Number(amount))) {
    if (Number(amount) < Number(cfg.min_amount)) {
      return { ok: false, applied: false, reason: "min_amount" as const };
    }
  }

  // 1) ledger upsert (idempotente por unique)
  const { data: ledgerExisting } = await supabaseAdmin
    .from("stamps_ledger")
    .select("id, status")
    .eq("source", params.source)
    .eq("ref_type", params.refType)
    .eq("ref_id", params.refId)
    .maybeSingle();

  if (ledgerExisting?.id) {
    // si existía pero estaba REVOKED, no re-aplicamos automático (evita “resurrecciones” raras)
    return { ok: true, applied: false, reason: "already_exists" as const };
  }

  const { data: ledger, error: ledErr } = await supabaseAdmin
    .from("stamps_ledger")
    .insert({
      user_id: params.userId,
      source: params.source,
      ref_type: params.refType,
      ref_id: params.refId,
      amount,
      stamps_delta: 1,
      status: "GRANTED",
      created_by: params.createdBy ?? null,
      reason: params.reason ?? null,
    })
    .select("id")
    .single();

  if (ledErr || !ledger?.id) {
    // si es conflict por unique, lo tratamos como idempotente
    if ((ledErr as any)?.code === "23505") return { ok: true, applied: false, reason: "dup" as const };
    throw new Error(ledErr?.message || "ledger insert error");
  }

  // 2) daily hard limit (PK user_id+day)
  const day = todayDateUTC();

  const { error: dailyErr } = await supabaseAdmin
    .from("stamps_daily")
    .insert({ user_id: params.userId, day, ledger_id: ledger.id });

  if (dailyErr) {
    // ya tuvo sello hoy → revocamos el ledger recién creado para no dejar basura
    await supabaseAdmin
      .from("stamps_ledger")
      .update({ status: "REVOKED", revoked_at: new Date().toISOString(), revoked_reason: "daily_limit" })
      .eq("id", ledger.id);

    return { ok: true, applied: false, reason: "daily_limit" as const };
  }

  // 3) wallet +1
  await ensureWallet(params.userId);

  const { error: updErr } = await supabaseAdmin.rpc("stamps_wallet_increment", {
    p_user_id: params.userId,
    p_delta: 1,
  });

  // Si no tenés RPC, hacemos update directo (fallback)
  if (updErr) {
    const { data: w } = await supabaseAdmin
      .from("stamps_wallet")
      .select("current_stamps, lifetime_stamps")
      .eq("user_id", params.userId)
      .single();

    const current = Math.max(0, Number(w?.current_stamps ?? 0) + 1);
    const life = Math.max(0, Number(w?.lifetime_stamps ?? 0) + 1);

    await supabaseAdmin
      .from("stamps_wallet")
      .update({ current_stamps: current, lifetime_stamps: life, updated_at: new Date().toISOString() })
      .eq("user_id", params.userId);
  }

  return { ok: true, applied: true, day, ledgerId: ledger.id };
}

export async function revokeStampByRef(params: {
  source: StampSource;
  refType: RefType;
  refId: string;
  revokedBy?: string | null;
  revokedReason: string;
}) {
  // buscar ledger GRANTED
  const { data: ledger, error } = await supabaseAdmin
    .from("stamps_ledger")
    .select("id, user_id, status")
    .eq("source", params.source)
    .eq("ref_type", params.refType)
    .eq("ref_id", params.refId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ledger?.id) return { ok: true, revoked: false, reason: "not_found" as const };
  if (ledger.status === "REVOKED") return { ok: true, revoked: false, reason: "already_revoked" as const };

  // borrar daily si estaba asociado
  const { data: dailyRow } = await supabaseAdmin
    .from("stamps_daily")
    .select("user_id, day")
    .eq("ledger_id", ledger.id)
    .maybeSingle();

  if (dailyRow) {
    await supabaseAdmin
      .from("stamps_daily")
      .delete()
      .eq("user_id", dailyRow.user_id)
      .eq("day", dailyRow.day);

    // wallet -1 (sin bajar de 0)
    const { data: w } = await supabaseAdmin
      .from("stamps_wallet")
      .select("current_stamps")
      .eq("user_id", ledger.user_id)
      .maybeSingle();

    const next = Math.max(0, Number(w?.current_stamps ?? 0) - 1);

    await supabaseAdmin
      .from("stamps_wallet")
      .update({ current_stamps: next, updated_at: new Date().toISOString() })
      .eq("user_id", ledger.user_id);
  }

  // marcar ledger revocado
  await supabaseAdmin
    .from("stamps_ledger")
    .update({
      status: "REVOKED",
      revoked_at: new Date().toISOString(),
      revoked_by: params.revokedBy ?? null,
      revoked_reason: params.revokedReason,
    })
    .eq("id", ledger.id);

  return { ok: true, revoked: true, ledgerId: ledger.id };
}
