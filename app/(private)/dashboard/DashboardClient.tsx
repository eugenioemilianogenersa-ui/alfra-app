// C:\Dev\alfra-app\app\(private)\dashboard\DashboardClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";

function formatDateTime(dt: string) {
  try {
    const d = new Date(dt);
    return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dt;
  }
}

/** Iconos SVG inline (cero dependencias) */
function IconMenu(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "w-6 h-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function IconBeer(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "w-6 h-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 6h8v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6Z" />
      <path d="M15 9h2a2 2 0 0 1 0 4h-2" />
      <path d="M7 6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3" />
      <path d="M9 11v7" />
      <path d="M12 11v7" />
    </svg>
  );
}

function IconGift(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "w-6 h-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 7v16" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C10 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C14 2 12 7 12 7Z" />
    </svg>
  );
}

function IconBike(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "w-6 h-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 18a3 3 0 1 0 6 0a3 3 0 0 0-6 0Z" />
      <path d="M13 18a3 3 0 1 0 6 0a3 3 0 0 0-6 0Z" />
      <path d="M11 18l2-7h4l2 4" />
      <path d="M7 18l3-9h4" />
      <path d="M9 9h6" />
    </svg>
  );
}

function StampGrid({
  current,
  onRedeem,
  redeeming,
}: {
  current: number;
  onRedeem: () => void;
  redeeming: boolean;
}) {
  const total = 8;
  const safe = Math.max(0, Math.min(total, Number(current || 0)));
  const canRedeem = safe >= total;

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
            Sellos AlFra
          </p>
          <p className="text-sm text-slate-700">
            {safe >= total ? (
              <span className="font-bold text-emerald-700">Premio desbloqueado</span>
            ) : (
              <>
                Llevás <span className="font-bold">{safe}</span>/<span className="font-bold">{total}</span>
              </>
            )}
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${
              safe >= total
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            {safe >= total ? "CANJEAR" : `Faltan ${total - safe}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < safe;
          return (
            <div
              key={i}
              className={`rounded-2xl border flex items-center justify-center aspect-square ${
                filled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={filled ? "/stamps/stamp-filled.png" : "/stamps/stamp-empty.png"}
                alt={filled ? "Sello ganado" : "Sello pendiente"}
                className={
                  filled
                    ? "w-12 h-12 sm:w-14 sm:h-14 object-contain"
                    : "w-12 h-12 sm:w-14 sm:h-14 object-contain opacity-20 grayscale"
                }
                loading="lazy"
                decoding="async"
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Máximo 1 sello por día • Se obtiene con compra mínima.
      </p>

      {canRedeem && (
        <button
          onClick={onRedeem}
          disabled={redeeming}
          className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition active:scale-[0.99]"
        >
          {redeeming ? "Canjeando..." : "CANJEAR PREMIO"}
        </button>
      )}
    </div>
  );
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

function DashboardSkeleton() {
  return (
    <div className="bg-slate-50 min-h-dvh pb-24 animate-pulse">
      <div className="text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden border border-white/10 bg-linear-to-br from-slate-950 via-slate-900 to-slate-800">
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -mr-14 -mt-14 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl -ml-14 -mb-14 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex justify-between items-start gap-3">
            <div className="space-y-2">
              <div className="h-3 w-20 bg-white/10 rounded-full" />
              <div className="h-7 w-36 bg-white/10 rounded-full" />
            </div>
            <div className="h-9 w-20 bg-white/10 rounded-full border border-white/5" />
          </div>

          <div className="mt-6 bg-white/10 h-28 rounded-2xl border border-white/10" />
        </div>
      </div>

      <div className="px-4 sm:px-6 -mt-4 relative z-20">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between mb-4">
            <div className="space-y-2">
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-40 bg-slate-100 rounded" />
            </div>
            <div className="h-6 w-16 bg-slate-100 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-slate-100 rounded-2xl border border-slate-50"
              />
            ))}
          </div>
          <div className="mt-4 h-3 w-48 bg-slate-100 rounded" />
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex justify-between mb-3">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-100 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-2xl border border-slate-50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Hola");
  const [points, setPoints] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [news, setNews] = useState<any[]>([]);

  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<null | {
    code: string;
    issued_at: string;
    expires_at: string;
    reward_name: string;
  }>(null);

  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!voucher?.code) return;
    if (!barcodeRef.current) return;

    try {
      JsBarcode(barcodeRef.current, voucher.code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 64,
        width: 2,
      });
    } catch (e: any) {
      setRedeemError(e?.message || "No se pudo generar el código de barras.");
    }
  }, [voucher?.code]);

  useEffect(() => {
    let channel: any;
    let cleanupWake: (() => void) | null = null;

    async function loadData() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const userId = user.id;
      const isPreviewMode = searchParams.get("preview") === "true";

      const { data: roleRpc } = await supabase.rpc("get_my_role");
      const userRole = String(roleRpc || "cliente").toLowerCase();

      if (!isPreviewMode) {
        if (userRole === "admin") {
          router.replace("/admin");
          return;
        }
        if (userRole === "delivery") {
          router.replace("/delivery");
          return;
        }
        if (userRole === "staff") {
          router.replace("/admin");
          return;
        }
      }

      try {
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();

        if (!profErr) {
          const dn = (profile?.display_name || "").trim();
          if (dn) setUserName(dn.split(" ")[0]);
          else setUserName((user.email || "Hola").split("@")[0] || "Hola");
        } else {
          setUserName((user.email || "Hola").split("@")[0] || "Hola");
        }
      } catch {
        setUserName((user.email || "Hola").split("@")[0] || "Hola");
      }

      async function refreshWallets(uid: string) {
        const { data: wallet } = await supabase
          .from("loyalty_wallets")
          .select("points")
          .eq("user_id", uid)
          .maybeSingle();

        if (wallet?.points != null) setPoints(Number(wallet.points) || 0);

        const { data: sw } = await supabase
          .from("stamps_wallet")
          .select("current_stamps")
          .eq("user_id", uid)
          .maybeSingle();

        if (sw?.current_stamps != null) setStamps(Number(sw.current_stamps) || 0);
      }

      await refreshWallets(userId);

      const { data: newsData } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);

      if (newsData) setNews(newsData);

      setLoading(false);

      channel = supabase
        .channel("public:wallets_global")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "loyalty_wallets" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === userId) setPoints(Number(n.points) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === userId) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === userId) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .subscribe();

      const onWake = () => {
        if (document.visibilityState === "visible") {
          refreshWallets(userId).catch(() => {});
        }
      };

      window.addEventListener("focus", onWake);
      document.addEventListener("visibilitychange", onWake);

      cleanupWake = () => {
        window.removeEventListener("focus", onWake);
        document.removeEventListener("visibilitychange", onWake);
      };
    }

    loadData();

    return () => {
      if (cleanupWake) cleanupWake();
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  async function handleRedeem() {
    setRedeemError(null);
    setRedeeming(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setRedeemError("Sesión inválida. Volvé a iniciar sesión.");
        return;
      }

      const r = await fetch("/api/stamps/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reward_name: "Premio AlFra" }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        setRedeemError(j?.error || "No se pudo canjear");
        return;
      }

      const res = j?.result || j;

      if (res?.current_stamps != null) setStamps(Number(res.current_stamps) || 0);

      setVoucher({
        code: String(res.code),
        issued_at: String(res.issued_at),
        expires_at: String(res.expires_at),
        reward_name: String(res.reward_name || "Premio"),
      });
    } catch (e: any) {
      setRedeemError(e?.message || "Error de red");
    } finally {
      setRedeeming(false);
    }
  }

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

  async function handleCopyCode() {
    if (!voucher?.code) return;
    const ok = await safeCopy(voucher.code);
    if (!ok) setRedeemError("No se pudo copiar en este dispositivo.");
  }

  async function handleShare() {
    if (!voucher?.code) return;

    const text =
      `Voucher AlFra\n` +
      `${voucher.reward_name}\n` +
      `Código: ${voucher.code}\n` +
      `Vence: ${formatDateTime(voucher.expires_at)}\n` +
      `Mostralo en caja para canjear.`;

    try {
      const navAny = navigator as any;
      if (navAny?.share) {
        await navAny.share({ title: "Voucher AlFra", text });
        return;
      }
    } catch {
      return;
    }

    await safeCopy(text);
  }

  function handleSavePdf() {
    if (!voucher?.code) return;

    let barcodeSvg = "";
    try {
      barcodeSvg = makeBarcodeSvg(voucher.code);
    } catch {}

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Voucher AlFra</title>
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
      <div class="title">${voucher.reward_name}</div>
    </div>
    <div class="content">
      <div class="box">
        <div class="lbl">Código</div>
        <div class="code">${voucher.code}</div>
        <div class="barcode">${barcodeSvg || ""}</div>
      </div>

      <div class="row">
        <div class="col">
          <div class="lbl">Emitido</div>
          <div class="val">${formatDateTime(voucher.issued_at)}</div>
        </div>
        <div class="col">
          <div class="lbl">Vence</div>
          <div class="val exp">${formatDateTime(voucher.expires_at)}</div>
        </div>
      </div>

      <div class="note">
        Mostralo en caja para canjear. Válido por 10 días desde la emisión.
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
      setRedeemError("No se pudo abrir la vista para guardar PDF (bloqueo de popups).");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function whatsappLink() {
    if (!voucher?.code) return "#";
    const rewardName = (voucher.reward_name || "").trim() || "Premio AlFra";

    const text =
      `Hola AlFra\n` +
      `Quiero canjear mi voucher.\n\n` +
      `Nombre: ${userName}\n` +
      `Premio: ${rewardName}\n` +
      `Código: ${voucher.code}\n` +
      `Vence: ${formatDateTime(voucher.expires_at)}\n\n` +
      `Gracias.`;

    return `https://wa.me/5493582405177?text=${encodeURIComponent(text)}`;
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  const isPreview = searchParams.get("preview") === "true";

  return (
    <div className="bg-slate-50 min-h-dvh pb-24">
      {isPreview && (
        <div className="bg-amber-100 text-amber-800 text-xs text-center py-1 font-bold fixed top-0 w-full z-50 pt-safe">
          MODO VISTA PREVIA
        </div>
      )}

      <div
        className={`text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden border border-white/10 ${
          isPreview ? "mt-6" : ""
        } bg-linear-to-br from-slate-950 via-slate-900 to-slate-800`}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -mr-14 -mt-14 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl -ml-14 -mb-14 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-slate-300/80 text-sm mb-1">Bienvenido,</p>
              <h1 className="text-2xl font-bold capitalize mb-2">{userName}</h1>
            </div>

            <Link
              href="/ayuda"
              className="shrink-0 bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-2 rounded-full border border-white/10 transition active:scale-95"
            >
              Ayuda
            </Link>
          </div>

          <div className="flex items-start justify-between gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 transition-all duration-300 mt-4">
            <div className="min-w-0">
              <p className="text-xs text-emerald-300 font-bold tracking-wider uppercase mb-1">
                Tus Puntos AlFra
              </p>
              <p className="text-4xl leading-none font-black text-amber-300 transition-all">
                {points}
              </p>
              <p className="text-[11px] text-slate-200/80 mt-2">
                Acumulá puntos y canjeá beneficios exclusivos.
              </p>
            </div>

            <Link
              href="/puntos"
              className="shrink-0 text-emerald-200 hover:text-emerald-100 text-xs font-bold underline underline-offset-4 decoration-white/20 hover:decoration-white/40 transition active:scale-[0.98] mt-1"
            >
              Ver historial
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 -mt-4 relative z-20">
        <StampGrid current={stamps} onRedeem={handleRedeem} redeeming={redeeming} />
        {redeemError && (
          <div className="mt-3 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {redeemError}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 mt-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Servicios</h2>
            <span className="text-[11px] text-slate-500">Accesos rápidos</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/carta"
              className="group rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <IconMenu className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Carta</div>
                <div className="text-[11px] text-slate-500">Pedí desde la app</div>
              </div>
            </Link>

            <Link
              href="/choperas"
              className="group rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <IconBeer className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Choperas</div>
                <div className="text-[11px] text-slate-500">Eventos y barriles</div>
              </div>
            </Link>

            <Link
              href="/beneficios"
              className="group rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <IconGift className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Beneficios</div>
                <div className="text-[11px] text-slate-500">Canjes y promos</div>
              </div>
            </Link>

            <Link
              href="/mis-pedidos"
              className="group rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <IconBike className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Seguimiento</div>
                <div className="text-[11px] text-slate-500">Estado del pedido</div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-slate-800">Novedades & Eventos</h2>
        </div>

        <div className="space-y-4">
          {news.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <IconGift className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Próximamente</p>
                  <p className="text-sm text-slate-600">
                    Publicaremos novedades y beneficios exclusivos para clientes AlFra.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
              >
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="h-32 w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-600 line-clamp-2">{item.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL VOUCHER (sellos) */}
      {voucher && (
        <div className="fixed inset-0 z-999 bg-black/50 flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setVoucher(null)} />

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="p-4 bg-slate-900 text-white shrink-0">
              <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Voucher AlFra</p>
              <h3 className="text-lg font-black">{voucher.reward_name}</h3>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto pb-safe">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Código</p>
                <p className="text-xl font-black text-slate-900 tracking-wider break-all">{voucher.code}</p>

                <div className="mt-2 w-full overflow-x-auto">
                  <div className="min-w-[320px] flex justify-center">
                    <svg ref={barcodeRef} className="w-full max-w-[520px]" />
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-500 text-center">
                  Escaneá este código en caja (CODE128).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500 font-bold uppercase">Emitido</p>
                  <p className="text-sm font-bold text-slate-800">{formatDateTime(voucher.issued_at)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500 font-bold uppercase">Vence</p>
                  <p className="text-sm font-black text-red-700">{formatDateTime(voucher.expires_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopyCode}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl"
                >
                  Copiar código
                </button>

                <button
                  onClick={handleSavePdf}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl"
                >
                  Guardar PDF
                </button>

                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl"
                >
                  WhatsApp
                </a>

                <button
                  onClick={handleShare}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold py-3 rounded-xl border border-slate-200"
                >
                  Compartir
                </button>
              </div>

              <button
                onClick={() => setVoucher(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl"
              >
                Cerrar
              </button>

              <p className="text-[11px] text-slate-500">
                Mostralo en caja para canjear. Válido por 10 días desde la emisión.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
