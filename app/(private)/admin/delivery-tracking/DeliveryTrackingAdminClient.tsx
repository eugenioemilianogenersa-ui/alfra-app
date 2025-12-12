"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";

const DeliveryMap = dynamic(() => import("@/components/DeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-400">
      Cargando mapa...
    </div>
  ),
});

const ACTIVE_DELIVERY_STATUS = ["asignado", "en camino", "enviado"];

type DeliveryTrackingRow = {
  delivery_id: number;
  order_id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  repartidor_nombre: string;
  status: string | null;
  order_estado: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_timestamp: string | null;
};

export default function DeliveryTrackingAdminClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<DeliveryTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrackingData = async () => {
    try {
      const { data: deliveries, error: delErr } = await supabase
        .from("deliveries")
        .select("id, order_id, delivery_user_id, status")
        .in("status", ACTIVE_DELIVERY_STATUS);

      if (delErr) {
        console.error("Error deliveries:", delErr.message);
        return;
      }
      if (!deliveries || deliveries.length === 0) {
        setRows([]);
        return;
      }

      const orderIds = deliveries.map((d) => d.order_id);
      const userIds = deliveries.map((d) => d.delivery_user_id);

      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select("id, cliente_nombre, direccion_entrega, monto, estado")
        .in("id", orderIds);

      if (ordErr) console.error("Error orders:", ordErr.message);

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profErr) console.error("Error profiles:", profErr.message);

      const rowsFinal: DeliveryTrackingRow[] = [];

      for (const d of deliveries) {
        const order = orders?.find((o) => o.id === d.order_id);
        const profile = profiles?.find((p) => p.id === d.delivery_user_id);

        const { data: lastLoc, error: locErr } = await supabase
          .from("delivery_locations")
          .select("lat, lng, timestamp")
          .eq("delivery_id", d.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (locErr) console.error("Error last location:", locErr.message);

        rowsFinal.push({
          delivery_id: d.id,
          order_id: d.order_id,
          cliente_nombre: order?.cliente_nombre ?? null,
          direccion_entrega: order?.direccion_entrega ?? null,
          monto: order?.monto ?? null,
          repartidor_nombre:
            profile?.display_name ||
            (profile?.email ? profile.email.split("@")[0] : "Repartidor"),
          status: d.status ?? null,
          order_estado: order?.estado ?? null,
          last_lat: lastLoc?.lat ?? null,
          last_lng: lastLoc?.lng ?? null,
          last_timestamp: lastLoc?.timestamp ?? null,
        });
      }

      setRows(rowsFinal);
    } catch (e: any) {
      console.error("Error fetchTrackingData:", e?.message || e);
    }
  };

  useEffect(() => {
    const load = async () => {
      await fetchTrackingData();
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("admin-delivery-tracking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_locations" },
        () => fetchTrackingData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => fetchTrackingData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchTrackingData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Cargando tracking de repartidores...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          Seguimiento de Delivery
        </h1>
        <button
          onClick={fetchTrackingData}
          className="text-xs px-3 py-1 rounded-full border bg-white hover:bg-slate-50 flex items-center gap-2"
        >
          ↻ Actualizar
        </button>
      </div>

      {rows.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-10 text-center text-slate-400 bg-white">
          😴 No hay repartos activos en este momento.
        </div>
      )}

      <div className="grid gap-4">
        {rows.map((r) => {
          const tienePos = r.last_lat !== null && r.last_lng !== null;

          return (
            <div
              key={r.delivery_id}
              className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-4"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-white">
                      #{r.order_id}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {r.cliente_nombre}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    🛵 Repartidor:{" "}
                    <span className="font-semibold">{r.repartidor_nombre}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    📍 {r.direccion_entrega}
                  </p>
                  {r.monto !== null && (
                    <p className="text-sm font-bold text-emerald-600">
                      💰 ${r.monto}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start md:items-end gap-2 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-semibold">
                      {r.status?.toUpperCase() || "SIN ESTADO"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Pedido: {r.order_estado || "?"}
                    </span>
                  </div>

                  {tienePos ? (
                    <>
                      <p className="text-[11px] text-slate-500">
                        Última posición: {r.last_lat?.toFixed(5)},{" "}
                        {r.last_lng?.toFixed(5)}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${r.last_lat},${r.last_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 underline"
                      >
                        Ver en Google Maps
                      </a>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Sin GPS registrado aún.
                    </p>
                  )}
                </div>
              </div>

              {tienePos && (
                <div>
                  <DeliveryMap lat={r.last_lat!} lng={r.last_lng!} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
