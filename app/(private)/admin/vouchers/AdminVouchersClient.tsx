"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type ValidateResult = {
  ok: boolean;
  code: string;
  status: string; // REDEEMED | ISSUED | EXPIRED | NOT_FOUND | CANCELED
  reward_name: string | null;
  issued_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
};

function formatDateTime(dt: string | null) {
  if (!dt) return "-";
  try {
    const d = new Date(dt);
    return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dt;
  }
}

function normCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export default function AdminVouchersClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meRole, setMeRole] = useState<string>("");

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ValidateResult | null>(null);

  useEffect(() => {
    async function boot() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // Rol por RPC (como venís usando)
      const { data: roleRpc } = await supabase.rpc("get_my_role");
      const role = String(roleRpc || "").toLowerCase();

      if (!["admin", "staff"].includes(role)) {
        router.replace("/dashboard");
        return;
      }

      setMeRole(role);
      setLoading(false);
    }

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function validateVoucher() {
    setErr(null);
    setResult(null);

    const c = normCode(code);
    if (!c) {
      setErr("Pegá un código.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setErr("Sesión inválida. Relogueá.");
        return;
      }

      const r = await fetch("/api/stamps/admin/validate-voucher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: c }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        setErr(j?.error || "No se pudo validar.");
        return;
      }

      const row = j?.result as ValidateResult | undefined;
      if (!row) {
        setErr("Respuesta inválida.");
        return;
      }

      setResult(row);
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function statusBadge(status: string) {
    const s = String(status || "").toUpperCase();
    const base = "inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black border";
    if (s === "REDEEMED") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    if (s === "EXPIRED") return `${base} bg-red-50 text-red-700 border-red-200`;
    if (s === "NOT_FOUND") return `${base} bg-slate-50 text-slate-700 border-slate-200`;
    if (s === "CANCELED") return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    if (s === "ISSUED") return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }

  if (loading) {
    return <div className="p-10">Cargando...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Admin / Staff
        </p>
        <h1 className="text-2xl font-black text-slate-900">Validar Vouchers</h1>
        <p className="text-sm text-slate-600 mt-1">
          Pegá el código del cliente y canjealo en caja. (Rol:{" "}
          <span className="font-bold">{meRole.toUpperCase()}</span>)
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <label className="text-xs font-bold text-slate-500 uppercase">
          Código voucher
        </label>

        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ALFRA-XXXX-YYYY"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={validateVoucher}
            disabled={submitting}
            className="rounded-xl px-4 py-3 font-black bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "..." : "CANJEAR"}
          </button>
        </div>

        {err && (
          <div className="mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {err}
          </div>
        )}

        {result && (
          <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-300 font-bold uppercase">
                  Resultado
                </p>
                <p className="font-mono font-black">{result.code}</p>
              </div>
              <span className={statusBadge(result.status)}>{result.status}</span>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">
                  Premio
                </p>
                <p className="text-sm font-black text-slate-900">
                  {result.reward_name || "-"}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">
                  Emitido
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {formatDateTime(result.issued_at)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">
                  Vence
                </p>
                <p className="text-sm font-black text-red-700">
                  {formatDateTime(result.expires_at)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">
                  Canjeado
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {formatDateTime(result.redeemed_at)}
                </p>
              </div>
            </div>

            <div className="px-4 pb-4">
              <p className="text-[11px] text-slate-500">
                Si dice <b>REDEEMED</b>, ya fue usado. Si dice <b>EXPIRED</b>, está vencido.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
