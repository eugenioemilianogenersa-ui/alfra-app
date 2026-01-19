// C:\Dev\alfra-app\app\(private)\dashboard\DashboardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatInt(n: number) {
  try {
    return new Intl.NumberFormat("es-AR").format(n);
  } catch {
    return String(n);
  }
}

/** ✅ Media responsive (evita alturas fijas que recortan distinto en PWA móvil) */
function ResponsiveMedia({
  src,
  alt,
  aspectRatio = "16/9",
  fit = "cover",
}: {
  src: string;
  alt: string;
  aspectRatio?: string; // "16/9" | "21/9" | "1/1" etc
  fit?: "cover" | "contain";
}) {
  return (
    <div className="relative w-full overflow-hidden bg-slate-100" style={{ aspectRatio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 w-full h-full ${
          fit === "contain" ? "object-contain" : "object-cover"
        } object-center`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
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

/** Confetti simple sin libs */
function ConfettiBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(() => {
    // determinístico (no random) para evitar “saltos” visuales raros
    return Array.from({ length: 18 }).map((_, i) => {
      const left = (i * 100) / 18; // %
      const delay = (i % 6) * 40; // ms
      const drift = (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 6); // px
      const rot = (i % 2 === 0 ? 1 : -1) * (120 + (i % 4) * 60); // deg
      const size = 6 + (i % 4) * 2; // px
      return { left, delay, drift, rot, size };
    });
  }, []);

  return (
    <div className="alfra-confetti" aria-hidden="true">
      {pieces.map((p, idx) => (
        <span
          key={idx}
          className="alfra-confetti-piece"
          style={
            {
              left: `${p.left}%`,
              animationDelay: `${p.delay}ms`,
              width: `${p.size}px`,
              height: `${p.size * 1.6}px`,
              ["--drift" as any]: `${p.drift}px`,
              ["--rot" as any]: `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
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

  // ✅ Celebración solo cuando cruza a 8/8 (no en cada render)
  const prevRef = useRef<number>(safe);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = safe;

    if (prev < total && safe >= total) {
      setCelebrate(true);
    }
  }, [safe]);

  return (
    <div className="relative">
      {/* CSS local simple */}
      <style jsx global>{`
        .alfra-glow {
          animation: alfraGlow 900ms ease-in-out 2;
        }
        @keyframes alfraGlow {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(16, 185, 129, 0);
          }
          50% {
            transform: scale(1.01);
            box-shadow: 0 14px 40px rgba(16, 185, 129, 0.18);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        .alfra-confetti {
          position: absolute;
          inset: -12px;
          pointer-events: none;
          overflow: hidden;
          border-radius: 20px;
        }
        .alfra-confetti-piece {
          position: absolute;
          top: -10px;
          border-radius: 3px;
          opacity: 0;
          background: linear-gradient(
            180deg,
            rgba(252, 211, 77, 0.95),
            rgba(16, 185, 129, 0.9)
          );
          animation: alfraConfetti 1200ms ease-out forwards;
        }
        @keyframes alfraConfetti {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift), 140px, 0) rotate(var(--rot));
            opacity: 0;
          }
        }
      `}</style>

      <div
        className={`bg-white p-4 rounded-2xl shadow-sm border border-slate-200 ${
          celebrate ? "alfra-glow border-emerald-200" : ""
        }`}
      >
        {celebrate && <ConfettiBurst onDone={() => setCelebrate(false)} />}

        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Sellos AlFra</p>
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
                className={`rounded-2xl border flex items-center justify-center aspect-square transition ${
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

        <p className="mt-3 text-[11px] text-slate-500">Máximo 1 sello por día • Se obtiene con compra mínima.</p>

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
    </div>
  );
}

/** Animación suave del número (micro feedback PRO) */
function animateNumber(from: number, to: number, ms: number, onUpdate: (v: number) => void) {
  const start = performance.now();
  const diff = to - from;

  function tick(now: number) {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + diff * eased);
    onUpdate(val);
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
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

  // UI-only
  const [pointsUi, setPointsUi] = useState(0);
  const prevPointsRef = useRef<number>(0);

  // Próximo beneficio real (mínimo points_cost publicado/activo)
  const [nextBenefit, setNextBenefit] = useState<null | { title: string; cost: number }>(null);

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

  // micro-animación puntos
  useEffect(() => {
    const prev = prevPointsRef.current;
    const next = Number(points || 0);
    if (prev === next) return;

    prevPointsRef.current = next;

    if (loading) {
      setPointsUi(next);
      return;
    }

    animateNumber(pointsUi, next, 450, (v) => setPointsUi(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const isPreview = searchParams.get("preview") === "true";

  const benefitMeta = useMemo(() => {
    if (!nextBenefit?.cost || nextBenefit.cost <= 0) return null;
    const p = Math.max(0, Number(pointsUi || 0));
    const cost = nextBenefit.cost;
    const pct = clamp(p / cost, 0, 1);
    const remaining = Math.max(0, cost - p);
    return { pct, remaining, cost, title: nextBenefit.title };
  }, [nextBenefit, pointsUi]);

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

        const newPoints = wallet?.points != null ? Number(wallet.points) || 0 : 0;
        setPoints(newPoints);
        setPointsUi((prev) => (loading ? newPoints : prev));

        const { data: sw } = await supabase
          .from("stamps_wallet")
          .select("current_stamps")
          .eq("user_id", uid)
          .maybeSingle();

        if (sw?.current_stamps != null) setStamps(Number(sw.current_stamps) || 0);
      }

      await refreshWallets(userId);

      // ✅ Próximo beneficio real (mínimo costo publicado/activo)
      try {
        const { data: bData } = await supabase
          .from("beneficios")
          .select("title, points_cost, is_published, is_active")
          .eq("is_published", true)
          .eq("is_active", true)
          .gt("points_cost", 0)
          .order("points_cost", { ascending: true })
          .limit(1);

        const b = Array.isArray(bData) ? bData?.[0] : null;
        if (b?.points_cost != null) {
          setNextBenefit({ title: String(b.title || "Beneficio"), cost: Number(b.points_cost) || 0 });
        } else {
          setNextBenefit(null);
        }
      } catch {
        setNextBenefit(null);
      }

      const { data: newsData } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);

      if (newsData) setNews(newsData);

      setLoading(false);

      channel = supabase
        .channel("public:wallets_global")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loyalty_wallets" }, (payload) => {
          const n: any = payload.new;
          if (n?.user_id === userId) setPoints(Number(n.points) || 0);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "stamps_wallet" }, (payload) => {
          const n: any = payload.new;
          if (n?.user_id === userId) setStamps(Number(n.current_stamps) || 0);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stamps_wallet" }, (payload) => {
          const n: any = payload.new;
          if (n?.user_id === userId) setStamps(Number(n.current_stamps) || 0);
        })
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

  if (loading) return <DashboardSkeleton />;

  const heroLine = benefitMeta
    ? benefitMeta.remaining <= 0
      ? `Ya podés canjear: ${benefitMeta.title}`
      : `Te faltan ${formatInt(benefitMeta.remaining)} pts para canjear: ${benefitMeta.title}`
    : "Sumá puntos y canjeá beneficios reales.";

  return (
    <div className="bg-slate-50 min-h-dvh pb-24">
      {isPreview && (
        <div className="bg-amber-100 text-amber-800 text-xs text-center py-1 font-bold fixed top-0 w-full z-50 pt-safe">
          MODO VISTA PREVIA
        </div>
      )}

      {/* HERO (solo PUNTOS) */}
      <div
        className={`text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden border border-white/10 ${
          isPreview ? "mt-6" : ""
        } bg-linear-to-br from-slate-950 via-slate-900 to-slate-800`}
      >
        <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl -mr-14 -mt-14 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-44 h-44 bg-amber-400/10 rounded-full blur-3xl -ml-14 -mb-14 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-slate-300/80 text-sm mb-1">Bienvenido,</p>
              <h1 className="text-2xl font-bold capitalize">{userName}</h1>
              <p className="text-[12px] text-slate-200/80 mt-1">{heroLine}</p>
            </div>

            <Link
              href="/ayuda"
              className="shrink-0 bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-2 rounded-full border border-white/10 transition active:scale-95"
            >
              Ayuda
            </Link>
          </div>

          <div className="mt-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-emerald-300 font-bold tracking-wider uppercase mb-1">
                  Tus Puntos AlFra
                </p>
                <p className="text-4xl leading-none font-black text-amber-300 tabular-nums">
                  {formatInt(pointsUi)}
                </p>

                {benefitMeta ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-200/80">
                      <span>Progreso al próximo canje</span>
                      <span className="font-bold">{Math.round(benefitMeta.pct * 100)}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-amber-300/90 rounded-full transition-[width] duration-500"
                        style={{ width: `${clamp(benefitMeta.pct * 100, 0, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-200/75">
                      Objetivo: {formatInt(benefitMeta.cost)} pts
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-200/75 mt-3">
                    Publicá al menos 1 beneficio activo para ver el progreso al próximo canje.
                  </p>
                )}
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
      </div>

      {/* SELLOS (con glow + confetti al completar) */}
      <div className="px-4 sm:px-6 -mt-4 relative z-20">
        <StampGrid current={stamps} onRedeem={handleRedeem} redeeming={redeeming} />
        {redeemError && (
          <div className="mt-3 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {redeemError}
          </div>
        )}
      </div>

      {/* SERVICIOS */}
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

      {/* NOVEDADES (✅ responsive) */}
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
                  <p className="text-sm font-extrabold text-slate-900">Novedades en camino</p>
                  <p className="text-sm text-slate-600">
                    Si publicás una noticia, acá te mostramos las 2 últimas automáticamente.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            news.map((item) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {item.image_url ? (
                  <ResponsiveMedia
  src={item.image_url}
  alt={String(item.title || "Novedad")}
  aspectRatio="21/9"
  fit="contain"
/>
                ) : (
                  <div className="w-full bg-linear-to-br from-slate-100 via-white to-slate-100" style={{ aspectRatio: "16/9" }} />
                )}

                <div className="p-4">
                  <h3 className="font-bold text-slate-800 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-600 line-clamp-2">{item.summary || item.content}</p>
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

                <p className="mt-2 text-[10px] text-slate-500 text-center">Escaneá este código en caja (CODE128).</p>
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
                <button onClick={handleCopyCode} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl">
                  Copiar código
                </button>

                <button onClick={handleSavePdf} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl">
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

              <button onClick={() => setVoucher(null)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl">
                Cerrar
              </button>

              <p className="text-[11px] text-slate-500">Mostralo en caja para canjear. Válido por 10 días desde la emisión.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
