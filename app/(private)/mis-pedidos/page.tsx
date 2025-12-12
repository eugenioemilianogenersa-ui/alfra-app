"use client";

import { useEffect, useRef, useState } from "react";
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

type Order = {
  id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  estado: string | null;
  creado_en: string;
};

type DeliveryLocation = {
  lat: number;
  lng: number;
};

export default function MisPedidosPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<DeliveryLocation | null>(null);

  const userIdRef = useRef<string | null>(null);

  // ---------- CARGA INICIAL ----------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;

      if (!uid) {
        setUserId(null);
        userIdRef.current = null;
        setOrders([]);
        setLoading(false);
        return;
      }

      setUserId(uid);
      userIdRef.current = uid;

      await loadOrders(uid);
      await trackDelivery(uid);
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- REALTIME ----------
  useEffect(() => {
    const channel = supabase
      .channel("client-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        async () => {
          const uid = userIdRef.current;
          if (!uid) return;
          await loadOrders(uid);
          await trackDelivery(uid);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_locations" },
        async () => {
          const uid = userIdRef.current;
          if (!uid) return;
          await trackDelivery(uid);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- AUTO-REFRESH CADA 5s ----------
  useEffect(() => {
    if (!userId) return;

    const intervalId = setInterval(() => {
      const uid = userIdRef.current;
      if (!uid) return;
      loadOrders(uid);
      trackDelivery(uid);
    }, 5_000);

    return () => clearInterval(intervalId);
  }, [userId]);

  // ---------- HELPERS ----------
  const loadOrders = async (uid: string) => {
    const activeStates = [
      "pendiente",
      "en preparación",
      "listo para entregar",
      "asignado",
      "en camino",
      "enviado",
    ];

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", uid)
      .in("estado", activeStates)
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargando orders:", error.message);
      return;
    }

    if (data) setOrders(data as Order[]);
  };

  const trackDelivery = async (uid: string) => {
    const { data: currentOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", uid)
      .in("estado", ["en camino", "enviado"])
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentOrder) {
      setTracking(null);
      return;
    }

    const { data: deliveryRow } = await supabase
      .from("deliveries")
      .select("id")
      .eq("order_id", currentOrder.id)
      .maybeSingle();

    if (!deliveryRow) return;

    const { data: loc } = await supabase
      .from("delivery_locations")
      .select("lat, lng")
      .eq("delivery_id", deliveryRow.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (loc) setTracking({ lat: loc.lat, lng: loc.lng });
  };

  // ---------- RENDER ----------
  if (loading)
    return <div className="p-6 text-center">Cargando mis pedidos...</div>;

  return (
    <div className="p-6 space-y-6 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-slate-800">Mis Pedidos</h1>

      {orders.length === 0 && (
        <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
          <p>No tenés pedidos activos en este momento.</p>
        </div>
      )}

      {orders.map((o) => (
        <div
          key={o.id}
          className="bg-white border rounded-xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-slate-800">
                Pedido #{o.id}
              </h2>

              {/* ⭐ SOLO FECHA (sin hora) */}
              <p className="text-xs text-slate-400">
                {new Date(o.creado_en).toLocaleDateString("es-AR")}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wide
                ${
                  o.estado === "entregado"
                    ? "bg-green-100 text-green-700 border-green-200"
                    : o.estado === "en camino" || o.estado === "enviado"
                    ? "bg-blue-600 text-white border-blue-600 animate-pulse"
                    : o.estado === "cancelado"
                    ? "bg-red-100 text-red-700 border-red-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200"
                }`}
            >
              {o.estado}
            </span>
          </div>

          <div className="p-4 space-y-2 text-sm text-slate-600">
            {o.cliente_nombre && (
              <p className="font-semibold text-slate-700">
                👤 {o.cliente_nombre}
              </p>
            )}
            <p>📍 {o.direccion_entrega}</p>
            <p className="font-bold text-emerald-600">💰 Total: ${o.monto}</p>
          </div>

          {(o.estado === "en camino" || o.estado === "enviado") && tracking && (
            <div className="border-t">
              <div className="bg-blue-50 p-2 text-center text-xs font-bold text-blue-700 flex items-center justify-center gap-2">
                🛵 TU PEDIDO ESTÁ EN CAMINO
              </div>
              <DeliveryMap lat={tracking.lat} lng={tracking.lng} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
