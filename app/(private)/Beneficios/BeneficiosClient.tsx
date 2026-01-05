"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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

export default function BeneficiosClient() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [beneficios, setBeneficios] = useState<BeneficioRow[]>([]);
  const [points, setPoints] = useState<number>(0);

  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);

  const pointsLabel = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-AR").format(points);
    } catch {
      return String(points);
    }
  }, [points]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);

      // 1) puntos actuales
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

      // 2) beneficios publicados
      const { data: bData, error: bErr } = await supabase
        .from("beneficios")
        .select("*")
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
        } else {
          setRedeemMsg("Error al canjear: " + msg);
        }
        return;
      }

      // la RPC retorna table(voucher_code text) => array con 1 fila
      const code = Array.isArray(data) ? data?.[0]?.voucher_code : data?.voucher_code;
      if (!code) {
        setRedeemMsg("Canje realizado, pero no se obtuvo el código del voucher.");
        return;
      }

      // refrescar puntos (post canje)
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

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <header className="text-center space-y-1">
        <h1 className="text-3xl font-bold">Beneficios AlFra 🏪</h1>
        <p className="opacity-80 text-sm">Canjeá tus puntos por premios reales.</p>
      </header>

      <section className="border rounded-xl bg-white p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Tus puntos</div>
          <div className="text-2xl font-bold">{pointsLabel}</div>
        </div>
        <div className="text-xs text-slate-500 text-right">
          * Si un beneficio requiere dinero extra, lo vas a ver en el voucher.
        </div>
      </section>

      {loading && <p className="text-sm text-slate-500 text-center">Cargando...</p>}

      {!loading && errorMsg && (
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && beneficios.length === 0 && (
        <p className="text-center text-slate-500 text-sm">
          Todavía no hay beneficios disponibles.
        </p>
      )}

      {redeemMsg && (
        <div className="border rounded-lg bg-amber-50 border-amber-200 p-3 text-sm text-amber-900">
          {redeemMsg}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {beneficios.map((b) => {
          const canRedeem = b.is_active && points >= (b.points_cost ?? 0) && (b.points_cost ?? 0) > 0;
          const needsCash = (b.cash_extra ?? 0) > 0;

          return (
            <article key={b.id} className="border rounded-xl bg-white overflow-hidden shadow-sm">
              {b.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image_url} alt={b.title} className="h-44 w-full object-cover" />
              )}

              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold text-lg leading-tight">{b.title}</h2>
                  {b.category && (
                    <span className="text-[10px] px-2 py-1 rounded-full border bg-slate-50 text-slate-600">
                      {b.category}
                    </span>
                  )}
                </div>

                {b.summary && <p className="text-sm text-slate-700">{b.summary}</p>}

                <div className="grid grid-cols-2 gap-2">
                  <div className="border rounded-lg p-2 bg-slate-50">
                    <div className="text-[11px] text-slate-500">Costo</div>
                    <div className="font-semibold">{b.points_cost} pts</div>
                  </div>
                  <div className="border rounded-lg p-2 bg-slate-50">
                    <div className="text-[11px] text-slate-500">Extra</div>
                    <div className="font-semibold">{needsCash ? `$${b.cash_extra}` : "—"}</div>
                  </div>
                </div>

                {b.content && (
                  <div className="border rounded-lg p-2">
                    <div className="text-[11px] text-slate-500">Detalle</div>
                    <div className="text-slate-700 whitespace-pre-wrap">{b.content}</div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    disabled={!canRedeem || redeemingId === b.id}
                    onClick={() => redeem(b)}
                    className={[
                      "w-full rounded-lg px-3 py-2 text-sm font-semibold border",
                      canRedeem
                        ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                        : "bg-slate-100 text-slate-500 border-slate-200",
                      redeemingId === b.id ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    {redeemingId === b.id
                      ? "Canjeando..."
                      : canRedeem
                      ? "CANJEAR BENEFICIO"
                      : "No alcanzan los puntos"}
                  </button>

                  {!b.is_active && (
                    <p className="mt-2 text-xs text-slate-500">
                      Beneficio temporalmente inactivo.
                    </p>
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
