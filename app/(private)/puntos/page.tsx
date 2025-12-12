// app/(private)/puntos/page.tsx
"use client";

import { useEffect, useState } from "react";
import { getUserWallet, WalletEvent } from "@/lib/getUserWallet";
import { createClient } from "@/lib/supabaseClient";

type WalletState = {
  loading: boolean;
  error: string | null;
  points: number;
  events: WalletEvent[];
};

export default function PuntosPage() {
  const [state, setState] = useState<WalletState>({
    loading: true,
    error: null,
    points: 0,
    events: [],
  });

  const supabase = createClient();

  const loadData = async () => {
    try {
      const { points, events } = await getUserWallet();
      setState({ loading: false, error: null, points, events });
    } catch (err) {
      console.error("Error en puntos:", err);
      setState((prev) => ({ ...prev, loading: false, error: "Error al cargar." }));
    }
  };

  useEffect(() => {
    loadData();

    // Suscripción a cambios
    const channel = supabase
      .channel("realtime-puntos-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loyalty_wallets" },
        () => loadData() // Si cambia el saldo, recargamos todo
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loyalty_events" },
        () => loadData() // Si entra un nuevo evento, recargamos todo
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="flex flex-col gap-6">
      <header className="text-center mt-4">
        <h1 className="text-xl font-semibold text-emerald-700">Puntos AlFra 🎯</h1>
        <p className="text-sm text-slate-500 mt-1">
          Consultá tus puntos acumulados y beneficios.
        </p>
      </header>

      {/* Tarjeta Total */}
      <section className="mx-auto w-full max-w-xl bg-white border rounded-xl shadow-sm p-6 text-center">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
          Total de puntos
        </p>
        <p className="mt-2 text-5xl font-bold text-slate-900">
          {state.loading ? "..." : state.points}
        </p>
        {state.error && <p className="mt-2 text-xs text-red-500">{state.error}</p>}
      </section>

      {/* Historial */}
      <section className="mx-auto w-full max-w-3xl bg-white border rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          Últimos movimientos
        </h2>

        {state.loading && state.events.length === 0 ? (
          <p className="text-xs text-slate-500">Cargando...</p>
        ) : state.events.length === 0 ? (
          <p className="text-xs text-slate-500">No hay movimientos aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="text-left px-2 py-1 font-semibold text-slate-500">Fecha</th>
                  <th className="text-left px-2 py-1 font-semibold text-slate-500">Delta</th>
                  <th className="text-left px-2 py-1 font-semibold text-slate-500">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {state.events.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-none">
                    <td className="px-2 py-1 text-slate-700">
                      {new Date(ev.created_at).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className={`px-2 py-1 font-semibold ${ev.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {ev.delta > 0 ? `+${ev.delta}` : ev.delta}
                    </td>
                    <td className="px-2 py-1 text-slate-700">{ev.reason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}