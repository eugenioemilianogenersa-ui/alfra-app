"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

type VoucherRow = {
  kind: "beneficios" | "sellos";
  voucher_code: string;
  status: string | null;
  created_at: string | null;
  used_at: string | null;

  points_spent: number | null;
  cash_extra: number | null;
  beneficio_title: string | null;
  beneficio_summary: string | null;
  beneficio_category: string | null;
  beneficio_content: string | null;
  beneficio_image_url: string | null;

  reward_name: string | null;
  expires_at: string | null;
};

function formatDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dt;
  }
}

export default function VoucherClient() {
  const supabase = createClient();
  const params = useParams();

  const code = useMemo(() => {
    const raw = (params as any)?.code;
    const v = Array.isArray(raw) ? raw[0] : raw;
    try {
      return decodeURIComponent(String(v || "")).trim();
    } catch {
      return String(v || "").trim();
    }
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [row, setRow] = useState<VoucherRow | null>(null);

  const [myRole, setMyRole] = useState<string>("cliente");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);

  const isPrivileged = useMemo(() => {
    const r = (myRole || "").toLowerCase();
    return r === "admin" || r === "staff";
  }, [myRole]);

  const isRedeemed = useMemo(() => {
    const s = String(row?.status || "").toLowerCase();
    return s === "canjeado";
  }, [row?.status]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      setRow(null);

      if (!code) {
        setErrorMsg("Código de voucher inválido.");
        setLoading(false);
        return;
      }

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) {
        setErrorMsg("Error de sesión: " + sessErr.message);
        setLoading(false);
        return;
      }
      if (!sess.session) {
        setErrorMsg("No hay sesión. Iniciá sesión para ver el voucher.");
        setLoading(false);
        return;
      }

      try {
        const { data: roleData } = await supabase.rpc("get_my_role");
        if (typeof roleData === "string" && roleData) setMyRole(roleData);
      } catch {
        // no bloquea
      }

      // 1) RPC
      const { data, error } = await supabase.rpc("get_voucher_by_code", { p_code: code });

      if (error) {
        const msg = error.message || "Error al buscar voucher.";
        setErrorMsg(msg.includes("not_authenticated") ? "Iniciá sesión para ver el voucher." : msg);
        setLoading(false);
        return;
      }

      const one = Array.isArray(data) ? data?.[0] : data;
      if (one) {
        setRow(one as VoucherRow);
        setLoading(false);
        return;
      }

      // 2) Fallback beneficios
      const { data: bv, error: bvErr } = await supabase
        .from("beneficios_vouchers")
        .select(
          `
          voucher_code,
          status,
          created_at,
          used_at,
          points_spent,
          cash_extra,
          beneficios:beneficio_id (
            title,
            summary,
            category,
            content,
            image_url
          )
        `
        )
        .eq("voucher_code", code)
        .maybeSingle();

      if (bvErr) {
        setErrorMsg(`Error al buscar voucher (beneficios): ${bvErr.code} - ${bvErr.message}`);
        setLoading(false);
        return;
      }

      if (bv) {
        const b = (bv as any).beneficios || {};
        setRow({
          kind: "beneficios",
          voucher_code: (bv as any).voucher_code,
          status: (bv as any).status ?? null,
          created_at: (bv as any).created_at ?? null,
          used_at: (bv as any).used_at ?? null,
          points_spent: (bv as any).points_spent ?? null,
          cash_extra: (bv as any).cash_extra ?? null,
          beneficio_title: b.title ?? null,
          beneficio_summary: b.summary ?? null,
          beneficio_category: b.category ?? null,
          beneficio_content: b.content ?? null,
          beneficio_image_url: b.image_url ?? null,
          reward_name: null,
          expires_at: null,
        });
        setLoading(false);
        return;
      }

      // 3) Fallback sellos (sin tocar)
      const { data: sv, error: svErr } = await supabase
        .from("stamps_vouchers")
        .select("code,status,issued_at,redeemed_at,reward_name,expires_at")
        .eq("code", code)
        .maybeSingle();

      if (svErr) {
        setErrorMsg(`Error al buscar voucher (sellos): ${svErr.code} - ${svErr.message}`);
        setLoading(false);
        return;
      }

      if (sv) {
        setRow({
          kind: "sellos",
          voucher_code: (sv as any).code,
          status: (sv as any).status ?? null,
          created_at: (sv as any).issued_at ?? null,
          used_at: (sv as any).redeemed_at ?? null,
          points_spent: null,
          cash_extra: null,
          beneficio_title: null,
          beneficio_summary: null,
          beneficio_category: null,
          beneficio_content: null,
          beneficio_image_url: null,
          reward_name: (sv as any).reward_name ?? null,
          expires_at: (sv as any).expires_at ?? null,
        });
        setLoading(false);
        return;
      }

      setErrorMsg("Voucher no encontrado (o no tenés acceso).");
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function redeemBeneficioVoucher(voucherCode: string) {
    setRedeemMsg(null);
    setRedeeming(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setRedeemMsg("No hay sesión válida.");
        return;
      }

      const res = await fetch("/api/beneficios/voucher/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: voucherCode }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json?.error === "not_redeemable") setRedeemMsg("Este voucher ya fue canjeado o no está en estado emitido.");
        else if (json?.error === "forbidden") setRedeemMsg("No tenés permisos para canjear.");
        else setRedeemMsg("Error al canjear: " + (json?.error || res.status));
        return;
      }

      setRedeemMsg("Voucher marcado como CANJEADO.");
      setRow((prev) =>
        prev
          ? {
              ...prev,
              status: "canjeado",
              used_at: json?.voucher?.used_at || new Date().toISOString(),
            }
          : prev
      );
    } finally {
      setRedeeming(false);
    }
  }

  const whatsappLink = useMemo(() => {
    if (!row) return null;
    if (row.kind === "beneficios" && isRedeemed) return null; // ✅ no compartir un voucher ya canjeado

    const msgLines: string[] = [];
    if (row.kind === "beneficios") {
      msgLines.push("ALFRA - Voucher Beneficios (Puntos)");
      msgLines.push(`Codigo: ${row.voucher_code}`);
      if (row.beneficio_title) msgLines.push(`Beneficio: ${row.beneficio_title}`);
      msgLines.push(`Estado: ${row.status ?? "—"}`);
      msgLines.push("Presentar en el local para validar.");
    } else {
      msgLines.push("ALFRA - Voucher Sellos");
      msgLines.push(`Codigo: ${row.voucher_code}`);
      if (row.reward_name) msgLines.push(`Premio: ${row.reward_name}`);
      msgLines.push(`Estado: ${row.status ?? "—"}`);
    }

    return `https://wa.me/?text=${encodeURIComponent(msgLines.join("\n"))}`;
  }, [row, isRedeemed]);

  async function downloadBeneficioPdf(voucherCode: string) {
    setRedeemMsg(null);
    if (isRedeemed) {
      setRedeemMsg("Este voucher ya fue canjeado. No tiene validez.");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setRedeemMsg("No hay sesión válida.");
      return;
    }

    const res = await fetch(`/api/beneficios/voucher/pdf?code=${encodeURIComponent(voucherCode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setRedeemMsg("No se pudo generar el PDF: " + (j?.error || res.status));
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ALFRA-beneficio-${voucherCode}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <main className="max-w-3xl mx-auto p-6 text-center text-slate-500">Cargando voucher...</main>;
  }

  if (errorMsg) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">{errorMsg}</div>
      </main>
    );
  }

  if (!row) return null;

  // BENEFICIOS
  if (row.kind === "beneficios") {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Voucher de Beneficio</h1>
          <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
        </header>

        {isRedeemed && (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded-xl p-3 text-sm font-semibold text-center">
            CANJEADO — Este voucher ya no tiene validez.
            {row.used_at ? <div className="text-[11px] font-normal mt-1">Usado: {formatDateTime(row.used_at)}</div> : null}
          </div>
        )}

        {redeemMsg && (
          <div className="border rounded-lg bg-amber-50 border-amber-200 p-3 text-sm text-amber-900">{redeemMsg}</div>
        )}

        <section className="border rounded-xl bg-white p-4 space-y-3">
          <div>
            <div className="text-xs text-slate-500">Código</div>
            <div className="text-xl font-black tracking-wider">{row.voucher_code}</div>
            <div className="text-xs text-slate-500 mt-1">
              Estado: <span className="font-semibold">{row.status ?? "—"}</span>
              {row.used_at ? <span className="ml-2">• Usado: {formatDateTime(row.used_at)}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={isRedeemed}
              onClick={() => downloadBeneficioPdf(row.voucher_code)}
              className={[
                "rounded-lg px-3 py-2 text-sm font-semibold border",
                isRedeemed
                  ? "bg-slate-100 text-slate-500 border-slate-200"
                  : "bg-slate-900 text-white hover:bg-slate-800",
              ].join(" ")}
            >
              Descargar PDF
            </button>

            {whatsappLink ? (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-3 py-2 text-sm font-semibold border bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Compartir por WhatsApp
              </a>
            ) : (
              <button
                disabled
                className="rounded-lg px-3 py-2 text-sm font-semibold border bg-slate-100 text-slate-500 border-slate-200"
              >
                Compartir por WhatsApp
              </button>
            )}

            {isPrivileged && (
              <button
                disabled={redeeming || isRedeemed}
                onClick={() => redeemBeneficioVoucher(row.voucher_code)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold border",
                  isRedeemed
                    ? "bg-slate-100 text-slate-500 border-slate-200"
                    : "bg-amber-600 text-white border-amber-700 hover:bg-amber-700",
                  redeeming ? "opacity-70" : "",
                ].join(" ")}
              >
                {isRedeemed ? "Ya canjeado" : redeeming ? "Canjeando..." : "Marcar como CANJEADO"}
              </button>
            )}
          </div>

          {row.beneficio_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.beneficio_image_url}
              alt={row.beneficio_title ?? "Beneficio"}
              className="w-full h-48 object-cover rounded-lg border"
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Costo en puntos</div>
              <div className="font-semibold">{row.points_spent ?? 0} pts</div>
            </div>
            <div className="border rounded-lg p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">Extra $</div>
              <div className="font-semibold">{row.cash_extra && row.cash_extra > 0 ? `$${row.cash_extra}` : "—"}</div>
            </div>
          </div>

          {row.beneficio_title ? (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-[11px] text-slate-500">Beneficio</div>
              <div className="font-bold">{row.beneficio_title}</div>
              {row.beneficio_summary ? <div className="text-sm text-slate-700">{row.beneficio_summary}</div> : null}
              {row.beneficio_content ? <div className="text-sm text-slate-700 whitespace-pre-wrap">{row.beneficio_content}</div> : null}
            </div>
          ) : null}

          <div className="text-xs text-slate-500">
            Importante: el canje se valida en el local. Si requiere dinero extra, se cobra al retirar.
          </div>
        </section>
      </main>
    );
  }

  // SELLOS (sin tocar)
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Voucher de Sellos</h1>
        <p className="text-sm text-slate-600">Presentalo en AlFra para canjear.</p>
      </header>

      <section className="border rounded-xl bg-white p-4 space-y-3">
        <div className="text-xs text-slate-500">Código</div>
        <div className="text-xl font-black tracking-wider">{row.voucher_code}</div>

        <div className="text-sm">
          Premio: <strong>{row.reward_name ?? "Premio"}</strong>
        </div>

        <div className="text-xs text-slate-500">
          Estado: <strong>{row.status ?? "—"}</strong>
          {row.expires_at ? <span className="ml-2">• Vence: {new Date(row.expires_at).toLocaleDateString()}</span> : null}
        </div>
      </section>
    </main>
  );
}
