"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function formatDateTime(dt: string) {
  try {
    const d = new Date(dt);
    return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dt;
  }
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
    <div className="bg-white p-4 rounded-xl shadow-md border border-slate-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
            Sellos AlFra
          </p>
          <p className="text-sm text-slate-700">
            {safe >= total ? (
              <span className="font-bold text-emerald-700">¡Premio desbloqueado!</span>
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
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
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
          {redeeming ? "Canjeando..." : "CANJEAR PREMIO 🎁"}
        </button>
      )}
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

  useEffect(() => {
    let channel: any;

    async function loadData() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        setLoading(false);
        return;
      }

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
          .eq("id", user.id)
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

      const { data: wallet } = await supabase
        .from("loyalty_wallets")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wallet?.points != null) setPoints(Number(wallet.points) || 0);

      const { data: sw } = await supabase
        .from("stamps_wallet")
        .select("current_stamps")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sw?.current_stamps != null) setStamps(Number(sw.current_stamps) || 0);

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
            if (n?.user_id === user.id) setPoints(Number(n.points) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === user.id) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === user.id) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .subscribe();
    }

    loadData();

    return () => {
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
    } catch {
      // fallback
    }

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
      `🎁 Voucher AlFra\n` +
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

    const premioFijo = "Una Pinta Clásica + 1 Burguer Simple";

    const text =
      `Hola AlFra 👋\n` +
      `Quiero canjear mi voucher.\n\n` +
      `Nombre: ${userName}\n` +
      `Premio: ${premioFijo}\n` +
      `Código: ${voucher.code}\n` +
      `Vence: ${formatDateTime(voucher.expires_at)}\n\n` +
      `Gracias!`;

    return `https://wa.me/5493582405177?text=${encodeURIComponent(text)}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        Cargando...
      </div>
    );
  }

  const isPreview = searchParams.get("preview") === "true";

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      {isPreview && (
        <div className="bg-amber-100 text-amber-800 text-xs text-center py-1 font-bold fixed top-0 w-full z-50">
          👁️ MODO VISTA PREVIA
        </div>
      )}

      <div
        className={`bg-slate-900 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden ${
          isPreview ? "mt-6" : ""
        }`}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <p className="text-slate-400 text-sm mb-1">Bienvenido,</p>
          <h1 className="text-2xl font-bold capitalize mb-6">{userName} 👋</h1>

          <div className="flex items-center justify-between bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 transition-all duration-300">
            <div>
              <p className="text-xs text-emerald-300 font-bold tracking-wider uppercase mb-1">
                Tus Puntos AlFra
              </p>
              <p className="text-3xl font-black text-amber-400 transition-all">{points}</p>
            </div>

            <Link
              href="/puntos"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full transition-transform active:scale-95"
            >
              Ver Historial
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-4 relative z-20">
        <StampGrid current={stamps} onRedeem={handleRedeem} redeeming={redeeming} />
        {redeemError && (
          <div className="mt-3 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {redeemError}
          </div>
        )}
      </div>

      <div className="px-6 mt-6">
        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-100">
          <h2 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wide">Servicios</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Link href="/carta" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-xl">
                🍔
              </div>
              <span className="text-[10px] font-medium text-slate-600">Carta</span>
            </Link>
            <Link href="/choperas" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl">
                🍺
              </div>
              <span className="text-[10px] font-medium text-slate-600">Choperas</span>
            </Link>
            <Link href="/Beneficios" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center text-xl">
                💯​
              </div>
              <span className="text-[10px] font-medium text-slate-600">Beneficios</span>
            </Link>
            <Link href="/mis-pedidos" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-xl">
                🛵
              </div>
              <span className="text-[10px] font-medium text-slate-600">Seguimiento</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-slate-800">Novedades & Eventos</h2>
        </div>

        <div className="space-y-4">
          {news.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-400 text-sm">
              <p>No hay novedades.</p>
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.title} className="h-32 w-full object-cover" />
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

      {voucher && (
        <div className="fixed inset-0 z-999 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white">
              <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                Voucher AlFra
              </p>
              <h3 className="text-lg font-black">{voucher.reward_name}</h3>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-bold uppercase">Código</p>
                <p className="text-xl font-black text-slate-900 tracking-wider">{voucher.code}</p>
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
