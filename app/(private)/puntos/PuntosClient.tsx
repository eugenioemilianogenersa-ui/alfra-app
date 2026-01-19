// C:\Dev\alfra-app\app\(private)\puntos\PuntosClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getUserWallet, WalletEvent } from "@/lib/getUserWallet";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

type WalletState = {
  loading: boolean;
  error: string | null;
  points: number;
  events: WalletEvent[];
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

function formatDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dt;
  }
}

/** Micro animación del número */
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

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "red" | "amber";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${cls}`}>
      {children}
    </span>
  );
}

export default function PuntosClient() {
  const supabase = createClient();

  const [state, setState] = useState<WalletState>({
    loading: true,
    error: null,
    points: 0,
    events: [],
  });

  // UI-only
  const [pointsUi, setPointsUi] = useState(0);
  const prevPointsRef = useRef<number>(0);

  // Próximo beneficio real
  const [nextBenefit, setNextBenefit] = useState<null | { title: string; cost: number }>(null);

  // UI mapping (no toca DB)
  function prettyReason(raw?: string | null): string {
    const r = (raw ?? "").trim().toLowerCase();
    if (r === "earn_from_fudo_sale") return "Compra en AlFra";
    if (r === "manual_adjustment") return "Ajuste manual";
    if (r === "redeem_beneficio") return "Canje";
    return raw ?? "-";
  }

  const loadData = async () => {
    try {
      const { points, events } = await getUserWallet();
      setState({ loading: false, error: null, points, events });
    } catch (err) {
      console.error("Error en puntos:", err);
      setState((prev) => ({ ...prev, loading: false, error: "Error al cargar." }));
    }
  };

  // Cargar próximo beneficio (mínimo points_cost publicado y activo)
  const loadNextBenefit = async () => {
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
  };

  useEffect(() => {
    loadData();
    loadNextBenefit();

    const channel = supabase
      .channel("realtime-puntos-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_wallets" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_events" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "beneficios" }, () => loadNextBenefit())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // micro animación puntos
  useEffect(() => {
    const next = Number(state.points || 0);
    const prev = prevPointsRef.current;

    if (state.loading) {
      prevPointsRef.current = next;
      setPointsUi(next);
      return;
    }

    if (prev === next) return;

    prevPointsRef.current = next;
    animateNumber(pointsUi, next, 450, (v) => setPointsUi(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.points, state.loading]);

  const progress = useMemo(() => {
    if (!nextBenefit?.cost || nextBenefit.cost <= 0) return null;
    const p = Math.max(0, Number(pointsUi || 0));
    const cost = nextBenefit.cost;
    const pct = clamp(p / cost, 0, 1);
    const remaining = Math.max(0, cost - p);
    return { pct, remaining, cost, title: nextBenefit.title };
  }, [nextBenefit, pointsUi]);

  const hasEvents = state.events?.length > 0;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <header className="mt-2 sm:mt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Puntos AlFra</h1>
            <p className="text-sm text-slate-600 mt-1">Tu saldo, progreso y movimientos.</p>
          </div>

          <Link
            href="/dashboard"
            className="shrink-0 text-xs font-extrabold rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 transition"
          >
            Volver
          </Link>
        </div>
      </header>

      {/* Hero saldo + progreso */}
      <section className="mt-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300">Saldo</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl sm:text-5xl font-black text-amber-300 tabular-nums">{formatInt(pointsUi)}</div>
              <div className="text-[12px] text-slate-200/80 mt-1">Acumulá y canjeá beneficios.</div>
            </div>

            <Link
              href="/beneficios"
              className="shrink-0 text-xs font-extrabold rounded-xl bg-white/10 border border-white/10 px-3 py-2 hover:bg-white/15 transition"
            >
              Ver Beneficios
            </Link>
          </div>

          {progress ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-slate-200/80">
                <span>Progreso al próximo canje</span>
                <span className="font-black">{Math.round(progress.pct * 100)}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-amber-300/90 rounded-full transition-[width] duration-500"
                  style={{ width: `${clamp(progress.pct * 100, 0, 100)}%` }}
                />
              </div>
              <div className="mt-2 text-[12px] text-slate-200/80">
                {progress.remaining <= 0 ? (
                  <span className="font-black text-emerald-300">Ya podés canjear: {progress.title}</span>
                ) : (
                  <>
                    Te faltan <span className="font-black text-white">{formatInt(progress.remaining)}</span> pts para{" "}
                    <span className="font-black">{progress.title}</span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-slate-200/65 mt-1">Objetivo: {formatInt(progress.cost)} pts</div>
            </div>
          ) : (
            <div className="mt-4 text-[12px] text-slate-200/75">
              Publicá al menos 1 beneficio activo para ver el progreso al próximo canje.
            </div>
          )}
        </div>

        {/* Quick tips */}
        <div className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tip</p>
            <p className="text-sm font-extrabold text-slate-900 mt-1">Sumá puntos con cada compra</p>
            <p className="text-sm text-slate-600 mt-1">Cuando el pedido se cierre/entregue, se acredita automáticamente.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Canje</p>
            <p className="text-sm font-extrabold text-slate-900 mt-1">Elegí un beneficio</p>
            <p className="text-sm text-slate-600 mt-1">Entrá a Beneficios y canjeá si te alcanza el saldo.</p>
          </div>
        </div>
      </section>

      {/* Error */}
      {state.error && (
        <div className="mt-4 text-xs font-extrabold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {state.error}
        </div>
      )}

      {/* Movimientos */}
      <section className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="p-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">Movimientos</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Historial de acreditaciones y ajustes.</p>
          </div>

          {!state.loading && hasEvents && <Badge tone="slate">{state.events.length} items</Badge>}
        </div>

        <div className="px-4 pb-4">
          {state.loading && state.events.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Cargando movimientos...
            </div>
          ) : !hasEvents ? (
            <div className="rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-slate-50 p-4">
              <p className="text-sm font-extrabold text-slate-900">Todavía no hay movimientos</p>
              <p className="text-sm text-slate-600 mt-1">
                Cuando hagas tu primera compra, vas a ver acá la acreditación con fecha y detalle.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/carta"
                  className="text-xs font-extrabold rounded-xl bg-slate-900 text-white px-3 py-2 hover:bg-slate-800 transition"
                >
                  Ver Carta
                </Link>
                <Link
                  href="/mis-pedidos"
                  className="text-xs font-extrabold rounded-xl bg-white border border-slate-200 text-slate-900 px-3 py-2 hover:bg-slate-50 transition"
                >
                  Mis Pedidos
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {state.events.map((ev) => {
                const delta = Number(ev.delta || 0);
                const isPlus = delta > 0;
                const tone = isPlus ? "emerald" : delta < 0 ? "red" : "slate";

                return (
                  <div
                    key={ev.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge tone={tone}>{isPlus ? `+${delta}` : `${delta}`}</Badge>
                          <p className="text-sm font-extrabold text-slate-900 truncate">
                            {prettyReason((ev as any).reason ?? "-")}
                          </p>
                        </div>
                        <p className="text-[12px] text-slate-500 mt-1">{formatDateTime(ev.created_at)}</p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-black ${isPlus ? "text-emerald-700" : "text-red-700"}`}>
                          {isPlus ? `+${formatInt(delta)}` : formatInt(delta)}
                        </p>
                        <p className="text-[11px] text-slate-500">puntos</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
