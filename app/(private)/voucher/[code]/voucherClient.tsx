"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";

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

function safeDate(dt?: string | null) {
  if (!dt) return null;
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function makeBarcodeSvg(code: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, code, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 64,
    width: 2,
  });
  return svg.outerHTML;
}

export default function VoucherClient() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();

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

  const barcodeRef = useRef<SVGSVGElement | null>(null);

  const isPrivileged = useMemo(() => {
    const r = (myRole || "").toLowerCase();
    return r === "admin" || r === "staff";
  }, [myRole]);

  // ✅ FIX: soporta beneficios ("canjeado") y sellos ("REDEEMED")
  const isRedeemed = useMemo(() => {
    const s = String(row?.status || "").trim().toLowerCase();
    return s === "canjeado" || s === "redeemed";
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

      // 1) RPC unificado
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

      // 3) Fallback sellos
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

  useEffect(() => {
    if (!row?.voucher_code) return;
    if (!barcodeRef.current) return;

    try {
      JsBarcode(barcodeRef.current, row.voucher_code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 64,
        width: 2,
      });
    } catch (e: any) {
      setRedeemMsg(e?.message || "No se pudo generar el código de barras.");
    }
  }, [row?.voucher_code]);

  async function safeCopy(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

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
    if (row.kind === "beneficios" && isRedeemed) return null;

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

  async function handleShare() {
    if (!row?.voucher_code) return;

    const title = row.kind === "beneficios" ? "Voucher Beneficios AlFra" : "Voucher Sellos AlFra";

    const textLines: string[] = [];
    if (row.kind === "beneficios") {
      textLines.push("🎁 Voucher AlFra (Beneficios)");
      if (row.beneficio_title) textLines.push(row.beneficio_title);
      textLines.push(`Código: ${row.voucher_code}`);
      textLines.push(`Estado: ${row.status ?? "—"}`);
    } else {
      textLines.push("🎁 Voucher AlFra (Sellos)");
      if (row.reward_name) textLines.push(row.reward_name);
      textLines.push(`Código: ${row.voucher_code}`);
      textLines.push(`Estado: ${row.status ?? "—"}`);
      if (row.expires_at) textLines.push(`Vence: ${formatDateTime(row.expires_at)}`);
    }

    const text = textLines.join("\n");

    try {
      const navAny = navigator as any;
      if (navAny?.share) {
        await navAny.share({ title, text });
        return;
      }
    } catch {}

    await safeCopy(text);
    setRedeemMsg("Texto copiado para compartir.");
  }

  function handleSavePdfLikeStamps() {
    if (!row?.voucher_code) return;

    let barcodeSvg = "";
    try {
      barcodeSvg = makeBarcodeSvg(row.voucher_code);
    } catch {}

    const headerTitle = row.kind === "beneficios" ? "Voucher Beneficios" : "Voucher Sellos";

    const subtitle =
      row.kind === "beneficios" ? row.beneficio_title || "Beneficio AlFra" : row.reward_name || "Premio AlFra";

    const issued = row.created_at ? formatDateTime(row.created_at) : "—";
    const expires = row.kind === "sellos" && row.expires_at ? formatDateTime(row.expires_at) : null;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${headerTitle} - AlFra</title>
<style>
  body{font-family:Arial, sans-serif; padding:24px; background:#f8fafc;}
  .card{max-width:520px; margin:0 auto; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; background:white;}
  .head{background:#0f172a; color:white; padding:16px;}
  .head .sub{font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#6ee7b7; font-weight:700}
  .head .title{font-size:18px; font-weight:900; margin-top:6px}
  .content{padding:16px}
  .box{background:#f1f5f9; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin-bottom:12px}
  .lbl{font-size:11px; color:#64748b; font-weight:800; text-transform:uppercase}
  .code{font-size:22px; font-weight:900; letter-spacing:.08em; margin-top:6px}
  .row{display:flex; gap:12px}
  .col{flex:1; border:1px solid #e2e8f0; border-radius:14px; padding:12px}
  .val{font-size:14px; font-weight:800; margin-top:6px}
  .exp{color:#b91c1c}
  .note{font-size:11px; color:#64748b; margin-top:10px}
  .barcode{display:flex; justify-content:center; padding:10px 0 0 0;}
  svg{max-width:100%; height:auto;}
  @media print { body{background:white} }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="sub">Voucher AlFra</div>
      <div class="title">${subtitle}</div>
    </div>
    <div class="content">
      <div class="box">
        <div class="lbl">Código</div>
        <div class="code">${row.voucher_code}</div>
        <div class="barcode">${barcodeSvg || ""}</div>
      </div>

      <div class="row">
        <div class="col">
          <div class="lbl">Emitido</div>
          <div class="val">${issued}</div>
        </div>
        <div class="col">
          <div class="lbl">${expires ? "Vence" : "Estado"}</div>
          <div class="val ${expires ? "exp" : ""}">${expires ? expires : row.status ?? "—"}</div>
        </div>
      </div>

      <div class="note">
        Mostralo en caja para canjear.
      </div>
    </div>
  </div>

  <script>
    window.onload = function(){ window.print(); };
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) {
      setRedeemMsg("No se pudo abrir la vista para guardar PDF (bloqueo de popups).");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-500">Cargando voucher...</main>;
  }

  if (errorMsg) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-red-400 bg-red-50 p-4 rounded-xl text-sm">{errorMsg}</div>
      </main>
    );
  }

  if (!row) return null;

  const created = safeDate(row.created_at);
  const used = safeDate(row.used_at);
  const expires = safeDate(row.expires_at);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-900 text-white">
          <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Voucher AlFra</p>

          <h3 className="text-lg font-black">
            {row.kind === "beneficios" ? row.beneficio_title || "Beneficio AlFra" : row.reward_name || "Premio AlFra"}
          </h3>

          <p className="text-[11px] text-slate-300 mt-1">{row.kind === "beneficios" ? "Beneficios (Puntos)" : "Sellos"}</p>
        </div>

        <div className="p-4 space-y-3">
          {isRedeemed && (
            <div className="border border-red-300 bg-red-50 text-red-800 rounded-xl p-3 text-sm font-semibold text-center">
              CANJEADO — Este voucher ya no tiene validez.
              {used ? <div className="text-[11px] font-normal mt-1">Usado: {formatDateTime(used.toISOString())}</div> : null}
            </div>
          )}

          {redeemMsg && (
            <div className="border rounded-lg bg-amber-50 border-amber-200 p-3 text-sm text-amber-900">{redeemMsg}</div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-[11px] text-slate-500 font-bold uppercase">Código</p>
            <p className="text-xl font-black text-slate-900 tracking-wider">{row.voucher_code}</p>

            <div className="mt-2 flex justify-center">
              <svg ref={barcodeRef} />
            </div>

            <p className="mt-2 text-[10px] text-slate-500 text-center">Escaneá este código en caja (CODE128).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-bold uppercase">Emitido</p>
              <p className="text-sm font-bold text-slate-800">{created ? formatDateTime(created.toISOString()) : "—"}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-bold uppercase">{row.kind === "sellos" ? "Vence" : "Estado"}</p>
              <p className={`text-sm font-black ${row.kind === "sellos" ? "text-red-700" : "text-slate-800"}`}>
                {row.kind === "sellos" ? (expires ? formatDateTime(expires.toISOString()) : "—") : row.status ?? "—"}
              </p>
            </div>
          </div>

          {row.kind === "beneficios" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Costo en puntos</p>
                <p className="text-sm font-bold text-slate-800">{row.points_spent ?? 0} pts</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Extra $</p>
                <p className="text-sm font-bold text-slate-800">
                  {row.cash_extra && row.cash_extra > 0 ? `$${row.cash_extra}` : "—"}
                </p>
              </div>
            </div>
          )}

          {row.kind === "beneficios" && row.beneficio_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.beneficio_image_url}
              alt={row.beneficio_title ?? "Beneficio"}
              className="w-full h-48 object-cover rounded-xl border border-slate-200"
            />
          ) : null}

          {row.kind === "beneficios" && (row.beneficio_summary || row.beneficio_content) ? (
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <p className="text-[11px] text-slate-500 font-bold uppercase">Detalle</p>
              {row.beneficio_summary ? <p className="text-sm text-slate-700">{row.beneficio_summary}</p> : null}
              {row.beneficio_content ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{row.beneficio_content}</p> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                if (!row?.voucher_code) return;
                const ok = await safeCopy(row.voucher_code);
                setRedeemMsg(ok ? "Código copiado." : "No se pudo copiar en este dispositivo.");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl"
            >
              Copiar código
            </button>

            <button
              onClick={() => {
                if (row.kind === "beneficios" && isRedeemed) {
                  setRedeemMsg("Este voucher ya fue canjeado. No tiene validez.");
                  return;
                }
                if (row.kind === "beneficios") {
                  downloadBeneficioPdf(row.voucher_code);
                  return;
                }
                handleSavePdfLikeStamps();
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl"
            >
              Guardar PDF
            </button>

            {whatsappLink ? (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl"
              >
                WhatsApp
              </a>
            ) : (
              <button disabled className="bg-slate-100 text-slate-500 border border-slate-200 font-bold py-3 rounded-xl">
                WhatsApp
              </button>
            )}

            <button
              onClick={handleShare}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold py-3 rounded-xl border border-slate-200"
            >
              Compartir
            </button>
          </div>

          {row.kind === "beneficios" && isPrivileged && (
            <button
              disabled={redeeming || isRedeemed}
              onClick={() => redeemBeneficioVoucher(row.voucher_code)}
              className={[
                "w-full font-bold py-3 rounded-xl border",
                isRedeemed ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-amber-600 text-white border-amber-700 hover:bg-amber-700",
                redeeming ? "opacity-70" : "",
              ].join(" ")}
            >
              {isRedeemed ? "Ya canjeado" : redeeming ? "Canjeando..." : "Marcar como CANJEADO"}
            </button>
          )}

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl"
          >
            Cerrar
          </button>

          <p className="text-[11px] text-slate-500">
            Mostralo en caja para canjear. Si requiere dinero extra, se cobra al retirar.
          </p>
        </div>
      </div>
    </div>
  );
}
