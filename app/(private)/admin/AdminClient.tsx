"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function AdminClient() {
  const supabase = createClient();
  const [stats, setStats] = useState({ users: 0, orders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const { count: orderCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true });

      const { data: orders } = await supabase.from("orders").select("monto");
      const total = orders?.reduce((acc, curr) => acc + (curr.monto || 0), 0) || 0;

      setStats({
        users: userCount || 0,
        orders: orderCount || 0,
        revenue: total,
      });
      setLoading(false);
    }

    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-10">Cargando métricas...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Panel de Control</h1>
      <p className="text-slate-500 mb-8">Resumen de actividad en tiempo real.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl text-2xl">👥</div>
            <div>
              <p className="text-sm text-slate-500 font-medium uppercase">Usuarios Totales</p>
              <p className="text-3xl font-black text-slate-800">{stats.users}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl text-2xl">📦</div>
            <div>
              <p className="text-sm text-slate-500 font-medium uppercase">Pedidos Totales</p>
              <p className="text-3xl font-black text-slate-800">{stats.orders}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl text-2xl">💰</div>
            <div>
              <p className="text-sm text-slate-500 font-medium uppercase">Ingresos Estimados</p>
              <p className="text-3xl font-black text-slate-800">${stats.revenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-8 rounded-2xl text-center shadow-lg">
        <h3 className="text-xl font-bold mb-2">🚀 Sistema Operativo</h3>
        <p className="text-slate-400">
          Integración con Fudo: <span className="text-emerald-400 font-bold">LISTA</span>
        </p>
      </div>
    </div>
  );
}
