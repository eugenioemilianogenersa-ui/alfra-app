"use client";

export const dynamic = "force-dynamic";

import useSWR from "swr";

type FudoOrder = {
  id: string;
  fudo_id: string;
  created_at_fudo: string | null;
  closed_at_fudo: string | null;
  total: number | null;
  sale_type: string | null;
  sale_state: string | null;
  alfra_status: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FudoPedidosPage() {
  const { data, error, isLoading } = useSWR("/api/fudo/mirror-today", fetcher, {
    refreshInterval: 5000, // antes 15000
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Cargando pedidos de Fudo...
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="p-6 text-center text-red-600">
        Error cargando pedidos: {data?.error || "error de red"}
      </div>
    );
  }

  const orders: FudoOrder[] = data.orders || [];

  if (orders.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400">
        No hay pedidos de Fudo para hoy.
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-3 bg-slate-50 min-h-screen">
      <h1 className="text-xl font-bold text-slate-800 mb-2">
        🧾 Pedidos Fudo de hoy
      </h1>

      {orders.map((order) => (
        <div
          key={order.id}
          className="bg-white border rounded-xl shadow-sm p-4 flex flex-col gap-1"
        >
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">#{order.fudo_id}</span>
            <span className="text-xs text-slate-500">
              {order.created_at_fudo
                ? new Date(order.created_at_fudo).toLocaleTimeString()
                : "-"}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="uppercase text-xs tracking-wide text-slate-500">
              {order.sale_type || "SIN TIPO"}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full font-semibold ${
                order.sale_state === "CLOSED"
                  ? "bg-emerald-100 text-emerald-700"
                  : order.sale_state === "CANCELED"
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {order.sale_state || "SIN ESTADO"}
            </span>
          </div>

          <div className="flex justify-between items-center mt-1">
            <span className="text-lg font-bold text-emerald-600">
              ${order.total ?? 0}
            </span>
            {order.alfra_status && (
              <span className="text-xs text-blue-600">
                ALFRA: {order.alfra_status}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
