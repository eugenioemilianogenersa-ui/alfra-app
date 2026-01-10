"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type LookupUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone_normalized: string | null;
};

type LedgerRow = {
  id: string;
  created_at: string;
  source: "FUDO" | "APP" | "MANUAL";
  ref_type: "order_id" | "manual";
  ref_id: string;
  amount: number | null;
  status: "GRANTED" | "REVOKED";
  reason: string | null;
  revoked_reason: string | null;
};

type SyncResult = {
  ok: boolean;
  inspected?: number;
  applied?: number;
  revoked?: number;
  skippedNoPhone?: number;
  skippedNoUser?: number;
  grant_on_estado?: string;
  note?: string;
  error?: string;
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}
function last10(s: string) {
  const d = onlyDigits(s);
  if (!d) return "";
  return d.length >= 10 ? d.slice(-10) : d;
}

export default function AdminSellosClient() {
  const supabase = createClient();

  const [meRole, setMeRole] = useState<"admin" | "staff" | "other">("other");

  const [phone, setPhone] = useState("");
  const phoneNorm = useMemo(() => last10(phone), [phone]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [user, setUser] = useState<LookupUser | null>(null);
  const [currentStamps, setCurrentStamps] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [minAmount, setMinAmount] = useState<number>(5000);

  // manual form
  const [manualAmount, setManualAmount] = useState<string>("");
  const [manualReason, setManualReason] = useState<string>("");

  // ✅ sync fudo UI
  const [syncing, setSyncing] = useState(false);
  const [syncOut, setSyncOut] = useState<SyncResult | null>(null);

  // ✅ realtime channels
  const walletChRef = useRef<any>(null);
  const ledgerChRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_my_role");
      const r = String(data || "cliente").toLowerCase();
      if (r === "admin") setMeRole("admin");
      else if (r === "staff") setMeRole("staff");
      else setMeRole("other");
    })();
  }, [supabase]);

  useEffect(() => {
    // trae config para mostrar mínimo (solo UI)
    (async () => {
      try {
        const r = await fetch("/api/stamps/config", { method: "GET" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.config?.min_amount != null) {
          setMinAmount(Number(j.config.min_amount) || 5000);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  async function getBearer() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  // ✅ Realtime: si hay cliente cargado, actualizar wallet/ledger al instante
  useEffect(() => {
    // limpiar canales previos
    if (walletChRef.current) {
      supabase.removeChannel(walletChRef.current);
      walletChRef.current = null;
    }
    if (ledgerChRef.current) {
      supabase.removeChannel(ledgerChRef.current);
      ledgerChRef.current = null;
    }

    if (!user?.id) return;

    const userId = user.id;

    // stamps_wallet (current_stamps)
    walletChRef.current = supabase
      .channel(`admin:stamps_wallet:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stamps_wallet" },
        (payload) => {
          const n: any = payload.new;
          if (String(n?.user_id || "") !== userId) return;
          const cs = Number(n?.current_stamps ?? 0) || 0;
          setCurrentStamps(cs);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stamps_wallet" },
        (payload) => {
          const n: any = payload.new;
          if (String(n?.user_id || "") !== userId) return;
          const cs = Number(n?.current_stamps ?? 0) || 0;
          setCurrentStamps(cs);
        }
      )
      .subscribe();

    // stamps_ledger (historial)
    ledgerChRef.current = supabase
      .channel(`admin:stamps_ledger:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stamps_ledger" },
        (payload) => {
          const n: any = payload.new;
          if (String(n?.user_id || "") !== userId) return;

          const row: LedgerRow = {
            id: String(n.id),
            created_at: String(n.created_at),
            source: String(n.source) as any,
            ref_type: String(n.ref_type) as any,
            ref_id: String(n.ref_id),
            amount: n.amount == null ? null : Number(n.amount),
            status: String(n.status) as any,
            reason: n.reason == null ? null : String(n.reason),
            revoked_reason: n.revoked_reason == null ? null : String(n.revoked_reason),
          };

          setLedger((prev) => {
            // evitar duplicados
            if (prev.some((x) => x.id === row.id)) return prev;
            const next = [row, ...prev];
            return next.slice(0, 25);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stamps_ledger" },
        (payload) => {
          const n: any = payload.new;
          if (String(n?.user_id || "") !== userId) return;

          setLedger((prev) =>
            prev.map((r) =>
              r.id === String(n.id)
                ? {
                    ...r,
                    status: String(n.status) as any,
                    revoked_reason:
                      n.revoked_reason == null ? null : String(n.revoked_reason),
                  }
                : r
            )
          );
        }
      )
      .subscribe();

    return () => {
      if (walletChRef.current) {
        supabase.removeChannel(walletChRef.current);
        walletChRef.current = null;
      }
      if (ledgerChRef.current) {
        supabase.removeChannel(ledgerChRef.current);
        ledgerChRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function runFudoSyncStamps() {
    setErr(null);
    setSyncOut(null);

    setSyncing(true);
    try {
      const token = await getBearer();
      if (!token) {
        setErr("Sesión inválida. Volvé a iniciar sesión.");
        return;
      }

      const r = await fetch("/api/stamps/admin/run-fudo-sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      // viene: { ok:true, result:{...} }
      const result = (j?.result || null) as SyncResult | null;
      setSyncOut(result);

      // respaldo (y mantiene tu UX)
      if (user?.id) {
        await lookup();
      }
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setSyncing(false);
    }
  }

  async function lookup() {
    setErr(null);
    setSyncOut(null);
    setUser(null);
    setLedger([]);
    setCurrentStamps(0);

    if (!phoneNorm) {
      setErr("Ingresá un teléfono.");
      return;
    }

    setLoading(true);
    try {
      const token = await getBearer();

      const r = await fetch("/api/stamps/admin/lookup-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ phone: phoneNorm }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      if (!j?.user) {
        setErr("No se encontró cliente con ese teléfono.");
        return;
      }

      setUser(j.user);

      const r2 = await fetch("/api/stamps/admin/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: j.user.id }),
      });

      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j2?.error || `HTTP ${r2.status}`);

      setCurrentStamps(Number(j2?.wallet?.current_stamps ?? 0) || 0);
      setLedger(Array.isArray(j2?.ledger) ? j2.ledger : []);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function grantManual() {
    setErr(null);
    if (!user?.id) return;

    const amt = Number(manualAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Monto inválido.");
      return;
    }
    if (amt < minAmount) {
      setErr(`Monto menor al mínimo (${minAmount}).`);
      return;
    }
    if (!manualReason.trim()) {
      setErr("Motivo requerido.");
      return;
    }

    setLoading(true);
    try {
      const token = await getBearer();
      const refId = crypto.randomUUID();

      const r = await fetch("/api/stamps/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          source: "MANUAL",
          refType: "manual",
          refId,
          amount: amt,
          reason: manualReason.trim(),
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      // respaldo (y mantiene tu UX)
      await lookup();
      setManualAmount("");
      setManualReason("");
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function revokeRow(row: LedgerRow) {
    setErr(null);

    setLoading(true);
    try {
      const token = await getBearer();

      const r = await fetch("/api/stamps/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source: row.source,
          refType: row.ref_type,
          refId: row.ref_id,
          reason: "Corrección manual (panel)",
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      // respaldo (y mantiene tu UX)
      await lookup();
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  if (meRole === "other") {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <p className="font-bold text-slate-800">Acceso denegado</p>
        <p className="text-sm text-slate-600">Solo ADMIN/STAFF.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">Gestión Sellos</h1>
            <p className="text-sm text-slate-600">
              Mínimo actual: <span className="font-bold">${minAmount}</span> • Máx 1 sello por día
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full border bg-slate-50 text-slate-600">
              {meRole === "admin" ? "ADMIN" : "STAFF"}
            </div>

            <button
              onClick={runFudoSyncStamps}
              disabled={syncing}
              className="text-xs font-black px-3 py-2 rounded-lg border border-slate-200 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              title="Sincroniza sellos desde Fudo (mesa/mostrador/delivery) sin tocar pedidos"
            >
              {syncing ? "Sincronizando..." : "Sync Sellos (Fudo)"}
            </button>
          </div>
        </div>

        {syncOut && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Resultado Sync
            </p>

            {syncOut?.ok === false ? (
              <p className="mt-2 text-sm font-bold text-red-700">
                {syncOut.error || "Sync falló"}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Inspeccionadas</p>
                  <p className="text-xl font-black text-slate-900">{syncOut.inspected ?? "-"}</p>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Aplicadas</p>
                  <p className="text-xl font-black text-emerald-700">{syncOut.applied ?? "-"}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Sin teléfono</p>
                  <p className="text-xl font-black text-slate-900">{syncOut.skippedNoPhone ?? "-"}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Sin usuario</p>
                  <p className="text-xl font-black text-slate-900">{syncOut.skippedNoUser ?? "-"}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Grant en</p>
                  <p className="text-sm font-black text-slate-900">{syncOut.grant_on_estado || "-"}</p>
                </div>
              </div>
            )}

            <p className="mt-3 text-[11px] text-slate-500">
              Tip: “Sin teléfono” = en Fudo no cargaron el cliente con teléfono. “Sin usuario” = hay teléfono pero no existe profile en AlFra App.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono cliente (busca por últimos 10 dígitos)"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <button
            onClick={lookup}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-60"
          >
            Buscar
          </button>
        </div>

        {err && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
      </div>

      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Resumen */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
              Cliente
            </p>
            <p className="mt-1 text-lg font-black text-slate-900">
              {user.display_name || (user.email ? user.email.split("@")[0] : "Cliente")}
            </p>
            <p className="text-sm text-slate-600">
              Tel: <span className="font-bold">{user.phone_normalized || "-"}</span>
            </p>

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Sellos actuales
              </p>
              <p className="text-4xl font-black text-emerald-700 mt-1">
                {currentStamps}
                <span className="text-base text-slate-500 font-bold">/8</span>
              </p>
            </div>
          </div>

          {/* Manual grant */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
              Cargar sello manual
            </p>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder={`Monto ($) >= ${minAmount}`}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <input
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Motivo (obligatorio)"
                className="sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Valida mínimo y respeta 1 sello por día automáticamente.
              </p>

              <button
                onClick={grantManual}
                disabled={loading}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-60"
              >
                Otorgar sello
              </button>
            </div>
          </div>

          {/* Ledger */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-3">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Historial (últimos 25)
              </p>
              <button
                onClick={lookup}
                disabled={loading}
                className="text-xs font-bold px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
              >
                Refrescar
              </button>
            </div>

            {ledger.length === 0 ? (
              <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center">
                Sin movimientos.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Fuente</th>
                      <th className="py-2 pr-3">Ref</th>
                      <th className="py-2 pr-3">Monto</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => {
                      const granted = row.status === "GRANTED";
                      return (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 font-bold text-slate-700">{row.source}</td>
                          <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                            {row.ref_type}:{row.ref_id}
                          </td>
                          <td className="py-2 pr-3 text-slate-700">
                            {row.amount != null ? `$${row.amount}` : "-"}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                                granted
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {granted ? (
                              <button
                                onClick={() => revokeRow(row)}
                                disabled={loading}
                                className="text-xs font-bold px-3 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                              >
                                Revertir
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {row.revoked_reason || "revocado"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
