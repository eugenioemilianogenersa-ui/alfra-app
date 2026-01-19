// C:\Dev\alfra-app\app\(private)\beneficios\BeneficiosClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type BeneficioRow = {
  id: string;
  created_at: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  points_cost: number;
  cash_extra: number;
  is_active: boolean;
  is_published: boolean;
  published_at: string | null;
};

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

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "red" | "amber" | "purple";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "purple"
      ? "bg-purple-50 text-purple-700 border-purple-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${cls}`}
    >
      {children}
    </span>
  );
}

/** ✅ Media responsive (evita “h-44” fijo que recorta distinto en móviles) */
function ResponsiveMedia({
  src,
  alt,
  aspectRatio = "16/9",
  fit = "cover",
}: {
  src: string;
  alt: string;
  aspectRatio?: string; // "16/9" | "4/3" | "1/1" etc
  fit?: "cover" | "contain";
}) {
  return (
    <div
      className="relative w-full overflow-hidden bg-slate-100"
      style={{ aspectRatio }}
    >
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

export default function BeneficiosClient() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [beneficios, setBeneficios] = useState<BeneficioRow[]>([]);
  const [points, setPoints] = useState<number>(0);

  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);

  const pointsLabel = useMemo(() => formatInt(points), [points]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setErrorMsg("Error auth: " + userErr.message);
        setLoading(false);
        return;
      }
      if (!userData?.user) {
        setErrorMsg("No hay usuario logueado.");
        setLoading(false);
        return;
      }

      const uid = userData.user.id;

      const { data: wallet, error: wErr } = await supabase
        .from("loyalty_wallets")
        .select("points")
        .eq("user_id", uid)
        .maybeSingle();

      if (wErr) {
        setErrorMsg(`Error al leer puntos: ${wErr.code} - ${wErr.message}`);
        setLoading(false);
        return;
      }

      setPoints(wallet?.points ?? 0);

      const { data: bData, error: bErr } = await supabase
        .from("beneficios")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (bErr) {
        setErrorMsg(`Error al cargar beneficios: ${bErr.code} - ${bErr.message}`);
        setLoading(false);
        return;
      }

      setBeneficios((bData ?? []) as BeneficioRow[]);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redeem(beneficio: BeneficioRow) {
    setRedeemMsg(null);
    setRedeemingId(beneficio.id);

    try {
      const { data, error } = await supabase.rpc("redeem_beneficio_create_voucher", {
        p_beneficio_id: beneficio.id,
      });

      if (error) {
        const msg = error.message || "Error al canjear.";
        if (msg.includes("insufficient_points")) {
          setRedeemMsg("No te alcanzan los puntos para este beneficio.");
        } else if (msg.includes("beneficio_inactive")) {
          setRedeemMsg("Este beneficio está inactivo por ahora.");
        } else if (msg.includes("beneficio_not_published")) {
          setRedeemMsg("Este beneficio no está publicado.");
        } else {
          setRedeemMsg("Error al canjear: " + msg);
        }
        return;
      }

      const code = Array.isArray(data) ? data?.[0]?.voucher_code : (data as any)?.voucher_code;
      if (!code) {
        setRedeemMsg("Canje realizado, pero no se obtuvo el código del voucher.");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const { data: wallet } = await supabase
          .from("loyalty_wallets")
          .select("points")
          .eq("user_id", uid)
          .maybeSingle();
        setPoints(wallet?.points ?? 0);
      }

      router.push(`/voucher/${encodeURIComponent(code)}`);
    } finally {
      setRedeemingId(null);
    }
  }

  const publishedCount = beneficios.length;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
      <header className="mt-2 sm:mt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Beneficios AlFra</h1>
            <p className="text-sm text-slate-600 mt-1">Canjeá tus puntos por premios reales.</p>
          </div>

          <Link
            href="/dashboard"
            className="shrink-0 text-xs font-extrabold rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 transition"
          >
            Volver
          </Link>
        </div>
      </header>

      <section className="mt-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300">Tus puntos</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <div className="text-4xl sm:text-5xl font-black text-amber-300 tabular-nums">{pointsLabel}</div>
            <Link
              href="/puntos"
              className="shrink-0 text-xs font-extrabold rounded-xl bg-white/10 border border-white/10 px-3 py-2 hover:bg-white/15 transition"
            >
              Ver movimientos
            </Link>
          </div>
          <p className="text-[12px] text-slate-200/80 mt-2">
            Elegí un beneficio y canjeá si te alcanza el saldo.
          </p>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="text-[12px] text-slate-600">
            {publishedCount > 0 ? (
              <>
                Beneficios disponibles: <span className="font-black text-slate-900">{publishedCount}</span>
              </>
            ) : (
              <>Todavía no hay beneficios publicados.</>
            )}
          </div>

          <Badge tone="slate">Puntos: {pointsLabel}</Badge>
        </div>
      </section>

      {loading && <p className="mt-6 text-sm text-slate-500 text-center">Cargando...</p>}

      {!loading && errorMsg && (
        <div className="mt-6 border border-red-400 bg-red-50 p-4 rounded-xl text-sm text-red-800">{errorMsg}</div>
      )}

      {!loading && !errorMsg && beneficios.length === 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-slate-50 p-5">
          <p className="text-sm font-extrabold text-slate-900">No hay beneficios todavía</p>
          <p className="text-sm text-slate-600 mt-1">Apenas publiquen uno, lo vas a ver acá.</p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/carta"
              className="text-xs font-extrabold rounded-xl bg-slate-900 text-white px-3 py-2 hover:bg-slate-800 transition"
            >
              Ver Carta
            </Link>
            <Link
              href="/puntos"
              className="text-xs font-extrabold rounded-xl bg-white border border-slate-200 text-slate-900 px-3 py-2 hover:bg-slate-50 transition"
            >
              Ver Puntos
            </Link>
          </div>
        </div>
      )}

      {redeemMsg && (
        <div className="mt-6 border rounded-xl bg-amber-50 border-amber-200 p-3 text-sm text-amber-900">
          {redeemMsg}
        </div>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {beneficios.map((b) => {
          const cost = Number(b.points_cost ?? 0);
          const cash = Number(b.cash_extra ?? 0);
          const needsCash = cash > 0;

          const canRedeem = b.is_active && cost > 0 && points >= cost;
          const pct = cost > 0 ? clamp(points / cost, 0, 1) : 0;
          const remaining = cost > 0 ? Math.max(0, cost - points) : 0;

          const stateBadge = !b.is_active
            ? { text: "Inactivo", tone: "slate" as const }
            : canRedeem
            ? { text: "Te alcanza", tone: "emerald" as const }
            : { text: `Faltan ${formatInt(remaining)} pts`, tone: "amber" as const };

          return (
            <article key={b.id} className="border rounded-2xl bg-white overflow-hidden shadow-sm hover:shadow-md transition">
              {b.image_url ? (
                <ResponsiveMedia src={b.image_url} alt={b.title} aspectRatio="16/9" fit="cover" />
              ) : (
                <div className="w-full bg-linear-to-br from-slate-100 via-white to-slate-100" style={{ aspectRatio: "16/9" }} />
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-black text-lg leading-tight text-slate-900">{b.title}</h2>
                    {b.summary && <p className="text-sm text-slate-600 mt-1">{b.summary}</p>}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {b.category ? <Badge tone="purple">{b.category}</Badge> : <span />}
                    <Badge tone={stateBadge.tone as any}>{stateBadge.text}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">Costo</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{formatInt(cost)} pts</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">Extra</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{needsCash ? `$${formatInt(cash)}` : "—"}</p>
                  </div>
                </div>

                {cost > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Progreso</span>
                      <span className="font-black text-slate-700">{Math.round(pct * 100)}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-emerald-600/80 rounded-full transition-[width] duration-500"
                        style={{ width: `${clamp(pct * 100, 0, 100)}%` }}
                      />
                    </div>

                    {!canRedeem && b.is_active && (
                      <p className="mt-2 text-[12px] text-slate-600">
                        Te faltan <span className="font-black text-slate-900">{formatInt(remaining)}</span> pts para canjear.
                      </p>
                    )}

                    {canRedeem && b.is_active && (
                      <p className="mt-2 text-[12px] text-emerald-700 font-black">Listo para canjear.</p>
                    )}

                    {!b.is_active && (
                      <p className="mt-2 text-[12px] text-slate-600">Este beneficio está temporalmente inactivo.</p>
                    )}
                  </div>
                )}

                {b.content && (
                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">Ver detalle</summary>
                    <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{b.content}</div>
                  </details>
                )}

                <div className="pt-1">
                  <button
                    disabled={!canRedeem || redeemingId === b.id}
                    onClick={() => redeem(b)}
                    className={[
                      "w-full rounded-xl px-3 py-3 text-sm font-black border transition",
                      canRedeem
                        ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                        : "bg-slate-100 text-slate-500 border-slate-200",
                      redeemingId === b.id ? "opacity-70 cursor-wait" : "",
                    ].join(" ")}
                  >
                    {redeemingId === b.id ? "Canjeando..." : canRedeem ? "CANJEAR" : "No alcanza el saldo"}
                  </button>

                  {needsCash && (
                    <p className="mt-2 text-[11px] text-slate-500">Este beneficio requiere dinero extra además del canje.</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
