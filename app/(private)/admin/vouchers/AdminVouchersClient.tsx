"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";

type OwnerInfo = {
  id?: string;
  display_name: string | null;
  phone_normalized: string | null;
};

type ValidateResult = {
  ok: boolean;
  code: string;
  status: string; // REDEEMED | ISSUED | EXPIRED | NOT_FOUND | CANCELED
  reward_name: string | null;
  issued_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;

  redeemed_by?: string | null;
  redeemed_channel?: string | null;
  redeemed_presenter?: string | null;
  redeemed_note?: string | null;

  owner?: OwnerInfo | null;
};

type HistoryRow = {
  id: string;
  code: string;
  status: string;
  reward_name: string | null;
  issued_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_channel: string | null;
  redeemed_presenter: string | null;
  redeemed_note: string | null;
  user_id: string | null;
  profiles?: {
    display_name: string | null;
    phone_normalized: string | null;
  } | null;
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

function normSearch(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

export default function AdminVouchersClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meRole, setMeRole] = useState<string>("");

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ValidateResult | null>(null);

  // Meta canje
  const [channel, setChannel] = useState<string>("CAJA");
  const [presenter, setPresenter] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Historial
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [q, setQ] = useState("");

  // Refs (caja)
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    async function boot() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: roleRpc } = await supabase.rpc("get_my_role");
      const role = String(roleRpc || "").toLowerCase();

      if (!["admin", "staff"].includes(role)) {
        router.replace("/dashboard");
        return;
      }

      setMeRole(role);
      setLoading(false);

      fetchHistory();

      // autofocus caja
      setTimeout(() => {
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      }, 50);
    }

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Barcode al tener result
  useEffect(() => {
    if (!result?.code) return;
    if (!barcodeRef.current) return;

    try {
      JsBarcode(barcodeRef.current, result.code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 54,
        width: 2,
      });
    } catch {
      // ignore
    }
  }, [result?.code]);

  // Enter global: buscar o confirmar canje (modo caja)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;

      // No interferir cuando escribís observación (textarea)
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "textarea") return;

      // Si estamos en medio de requests, nada
      if (submitting || redeeming) return;

      e.preventDefault();

      const st = String(result?.status || "").toUpperCase();

      // Si hay resultado ISSUED -> confirmar canje
      if (result && st === "ISSUED") {
        redeemVoucher();
        return;
      }

      // Sino -> buscar por código actual
      lookupVoucher();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, submitting, redeeming, code]);

  async function getToken() {
    const { data: sess } = await supabase.auth.getSession();
    return sess?.session?.access_token || null;
  }

  async function lookupVoucher() {
    setErr(null);
    setResult(null);

    const c = normCode(code);
    if (!c) {
      setErr("Pegá un código.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
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
        setErr(j?.error || "No se pudo buscar.");
        return;
      }

      const row = j?.result as ValidateResult | undefined;
      if (!row) {
        setErr("Respuesta inválida.");
        return;
      }

      setResult(row);

      // reset meta cuando buscás un nuevo código
      setChannel("CAJA");
      setPresenter("");
      setNote("");

      // volver a focus (scanner)
      setTimeout(() => {
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      }, 10);
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  async function redeemVoucher() {
    setErr(null);
    if (!result) return;

    const s = String(result.status || "").toUpperCase();
    if (s !== "ISSUED") {
      setErr("Solo podés canjear si el estado es ISSUED.");
      return;
    }

    setRedeeming(true);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Sesión inválida. Relogueá.");
        return;
      }

      const r = await fetch("/api/stamps/admin/redeem-voucher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: result.code,
          redeemed_channel: channel,
          redeemed_presenter: presenter,
          redeemed_note: note,
        }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        setErr(j?.error || "No se pudo canjear.");
        if (j?.result) setResult(j.result as ValidateResult);
        return;
      }

      const row = j?.result as ValidateResult | undefined;
      if (!row) {
        setErr("Respuesta inválida.");
        return;
      }

      setResult(row);
      fetchHistory();

      // listo para el siguiente: limpiar input y focus
      setCode("");
      setTimeout(() => {
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      }, 50);
    } catch (e: any) {
      setErr(e?.message || "Error de red.");
    } finally {
      setRedeeming(false);
    }
  }

  async function fetchHistory() {
    setHistoryErr(null);
    setHistoryLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setHistoryErr("Sesión inválida.");
        return;
      }

      const r = await fetch("/api/stamps/admin/vouchers-history", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setHistoryErr(j?.error || "No se pudo cargar historial.");
        return;
      }

      setHistory(Array.isArray(j?.rows) ? (j.rows as HistoryRow[]) : []);
    } catch (e: any) {
      setHistoryErr(e?.message || "Error de red.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function statusBadge(status: string) {
    const s = String(status || "").toUpperCase();
    const base =
      "inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black border";
    if (s === "REDEEMED") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    if (s === "EXPIRED") return `${base} bg-red-50 text-red-700 border-red-200`;
    if (s === "NOT_FOUND") return `${base} bg-slate-50 text-slate-700 border-slate-200`;
    if (s === "CANCELED") return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    if (s === "ISSUED") return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }

  if (loading) return <div className="p-10">Cargando...</div>;

  const status = String(result?.status || "").toUpperCase();
  const canRedeem = !!result && status === "ISSUED";

  const qq = normSearch(q);
  const filteredHistory = !qq
    ? history
    : history.filter((row) => {
        const ownerName = row.profiles?.display_name || "";
        const ownerPhone = row.profiles?.phone_normalized || "";
        const hay =
          [
            row.code,
            row.reward_name || "",
            row.redeemed_channel || "",
            row.redeemed_presenter || "",
            row.redeemed_note || "",
            ownerName,
            ownerPhone,
          ]
            .join(" ")
            .toLowerCase() || "";
        return hay.includes(qq);
      });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Admin / Staff
        </p>
        <h1 className="text-2xl font-black text-slate-900">Vouchers (Canjes)</h1>
        <p className="text-xs text-slate-600 mt-1">
          Caja: pegá/escaneá → <b>Enter</b> busca → <b>Enter</b> confirma (si ISSUED).
        </p>
      </div>

      {/* BUSCADOR + RESULTADO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <label className="text-xs font-bold text-slate-500 uppercase">Código voucher</label>

        <div className="mt-2 flex gap-2">
          <input
            ref={codeInputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ALFRA-XXXX-YYYY"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={lookupVoucher}
            disabled={submitting}
            className="rounded-xl px-4 py-3 font-black bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "..." : "BUSCAR"}
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
                <p className="text-[11px] text-slate-300 font-bold uppercase">Resultado</p>
                <p className="font-mono font-black">{result.code}</p>
              </div>
              <span className={statusBadge(result.status)}>{result.status}</span>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Titular</p>
                <p className="text-sm font-black text-slate-900">
                  {result.owner?.display_name || "-"}
                </p>
                <p className="text-xs font-bold text-slate-600 mt-1">
                  {result.owner?.phone_normalized ? `Tel: ${result.owner.phone_normalized}` : ""}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Premio</p>
                <p className="text-sm font-black text-slate-900">{result.reward_name || "-"}</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:col-span-2">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Código de barras</p>
                <div className="mt-2 flex justify-center bg-white border border-slate-200 rounded-xl p-2">
                  <svg ref={barcodeRef} />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Emitido</p>
                <p className="text-sm font-bold text-slate-800">
                  {formatDateTime(result.issued_at)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Vence</p>
                <p className="text-sm font-black text-red-700">
                  {formatDateTime(result.expires_at)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Canjeado</p>
                <p className="text-sm font-bold text-slate-800">
                  {formatDateTime(result.redeemed_at)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Observación</p>
                <p className="text-sm font-bold text-slate-800">{result.redeemed_note || "-"}</p>
              </div>
            </div>

            {canRedeem && (
              <div className="px-4 pb-4">
                <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                  <p className="text-xs font-black text-slate-700 uppercase">
                    Registrar canje (trazabilidad)
                  </p>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase">
                        Medio
                      </label>
                      <select
                        value={channel}
                        onChange={(e) => setChannel(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400"
                      >
                        <option value="CAJA">CAJA</option>
                        <option value="WHATSAPP">WHATSAPP</option>
                        <option value="DELIVERY">DELIVERY</option>
                        <option value="OTRO">OTRO</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase">
                        Quién lo presentó
                      </label>
                      <input
                        value={presenter}
                        onChange={(e) => setPresenter(e.target.value)}
                        placeholder="Titular / Nombre de quien vino"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">
                        Observación
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ej: Vino el hermano con captura, validamos DNI por WhatsApp..."
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={redeemVoucher}
                      disabled={redeeming}
                      className="rounded-xl px-4 py-3 font-black bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {redeeming ? "..." : "CONFIRMAR CANJE"}
                    </button>

                    <button
                      onClick={() => {
                        setResult(null);
                        setErr(null);
                        setCode("");
                        setTimeout(() => {
                          codeInputRef.current?.focus();
                          codeInputRef.current?.select();
                        }, 20);
                      }}
                      className="rounded-xl px-4 py-3 font-black bg-slate-100 hover:bg-slate-200 text-slate-900"
                    >
                      LIMPIAR
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 pb-4">
              <p className="text-[11px] text-slate-500">
                <b>ISSUED</b>: listo para canjear. <b>REDEEMED</b>: ya fue usado. <b>EXPIRED</b>: vencido.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* HISTORIAL */}
      <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Historial</p>
            <h2 className="text-lg font-black text-slate-900">Últimos canjes</h2>
            <p className="text-xs text-slate-600 mt-1">
              Buscá por código, nombre, teléfono, canal u observación.
            </p>
          </div>
          <button
            onClick={fetchHistory}
            disabled={historyLoading}
            className="rounded-xl px-4 py-2 font-black bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60"
          >
            {historyLoading ? "..." : "REFRESCAR"}
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={() => setQ("")}
            className="rounded-xl px-4 py-3 font-black bg-slate-100 hover:bg-slate-200 text-slate-900"
          >
            LIMPIAR
          </button>
        </div>

        {historyErr && (
          <div className="mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {historyErr}
          </div>
        )}

        <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-50 text-slate-600 text-[11px] font-black uppercase px-3 py-2">
            <div className="col-span-4">Código</div>
            <div className="col-span-3">Titular</div>
            <div className="col-span-2">Canje</div>
            <div className="col-span-3">Obs</div>
          </div>

          {historyLoading ? (
            <div className="p-4 text-sm font-bold text-slate-600">Cargando historial...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-4 text-sm font-bold text-slate-600">Sin resultados.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredHistory.map((row) => (
                <div key={row.id} className="grid grid-cols-12 px-3 py-3 text-sm">
                  <div className="col-span-4">
                    <div className="font-mono font-black text-slate-900">{row.code}</div>
                    <div className="text-xs font-bold text-slate-600 mt-1">
                      {row.reward_name || "-"}
                    </div>
                  </div>

                  <div className="col-span-3">
                    <div className="font-black text-slate-900">
                      {row.profiles?.display_name || "-"}
                    </div>
                    <div className="text-xs font-bold text-slate-600 mt-1">
                      {row.profiles?.phone_normalized || ""}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="font-black text-slate-900">
                      {row.redeemed_channel || "-"}
                    </div>
                    <div className="text-xs font-bold text-slate-600 mt-1">
                      {formatDateTime(row.redeemed_at)}
                    </div>
                  </div>

                  <div className="col-span-3">
                    <div className="text-xs font-bold text-slate-900">
                      {row.redeemed_presenter || "-"}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                      {row.redeemed_note || "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          Mostrando hasta 100 canjes. Si querés, después le agregamos paginado sin romper nada.
        </p>
      </div>
    </div>
  );
}