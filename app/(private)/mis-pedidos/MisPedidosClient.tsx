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

const ACTIVE_STATES = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
];

export default function MisPedidosClient() {
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);

  const [activeDeliveryId, setActiveDeliveryId] = useState<number | null>(null);
  const [tracking, setTracking] = useState<DeliveryLocation | null>(null);

  const userIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // --- helpers ---
  const loadOrders = async (uid: string) => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", uid)
      .in("estado", ACTIVE_STATES)
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargando orders:", error.message);
      return;
    }
    setOrders((data as Order[]) ?? []);
  };

  const refreshActiveDelivery = async (uid: string) => {
    const { data: currentOrder, error: oErr } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", uid)
      .eq("estado", "enviado")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (oErr) console.error("Error currentOrder:", oErr.message);

    if (!currentOrder?.id) {
      setActiveDeliveryId(null);
      setTracking(null);
      return;
    }

    const { data: deliveryRow, error: dErr } = await supabase
      .from("deliveries")
      .select("id")
      .eq("order_id", currentOrder.id)
      .maybeSingle();

    if (dErr) console.error("Error buscando delivery:", dErr.message);

    if (!deliveryRow?.id) {
      setActiveDeliveryId(null);
      setTracking(null);
      return;
    }

    setActiveDeliveryId(Number(deliveryRow.id));
  };

  const fetchLastLocation = async (deliveryId: number) => {
    const { data: loc, error } = await supabase
      .from("delivery_locations")
      .select("lat, lng")
      .eq("delivery_id", deliveryId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error last location:", error.message);
      return;
    }

    if (loc) setTracking({ lat: loc.lat, lng: loc.lng });
    else setTracking(null);
  };

  const refreshAll = async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    await loadOrders(uid);
    await refreshActiveDelivery(uid);

    // si ya sabemos el delivery activo, traemos última ubicación
    if (activeDeliveryId) {
      await fetchLastLocation(activeDeliveryId);
    }
  };

  // 1) init
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;

      setUserId(uid);
      userIdRef.current = uid;

      if (!uid) {
        setOrders([]);
        setTracking(null);
        setActiveDeliveryId(null);
        setLoading(false);
        return;
      }

      await loadOrders(uid);
      await refreshActiveDelivery(uid);
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) realtime (lo mantenemos)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`client-live-${userId}`)
      // Orders: si entra update/insert, refrescamos
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        async () => {
          await refreshAll();
        }
      )
      // Deliveries: si se asigna repartidor, refrescamos
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        async () => {
          await refreshAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeDeliveryId]);

  // 3) polling backup (esto es lo que te devuelve “instantáneo” sin refresh)
  useEffect(() => {
    if (!userId) return;

    const tick = async () => {
      // solo si la pestaña está visible (ahorra recursos)
      if (document.visibilityState !== "visible") return;
      await refreshAll();
    };

    // cada 3s (más ágil que 5s)
    const id = window.setInterval(tick, 3000);
    pollRef.current = id;

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeDeliveryId]);

  // 4) cada vez que cambia activeDeliveryId, traemos ubicación inmediata
  useEffect(() => {
    if (!activeDeliveryId) {
      setTracking(null);
      return;
    }
    fetchLastLocation(activeDeliveryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeliveryId]);

  if (loading) return <div className="p-6 text-center">Cargando mis pedidos...</div>;

  return (
    <div className="p-6 space-y-6 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-slate-800">Mis Pedidos</h1>

      {orders.length === 0 && (
        <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
          <p>No tenés pedidos activos en este momento.</p>
        </div>
      )}

      {orders.map((o) => (
        <div key={o.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-slate-800">Pedido #{o.id}</h2>
              <p className="text-xs text-slate-400">
                {new Date(o.creado_en).toLocaleDateString("es-AR")}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wide
                ${
                  o.estado === "entregado"
                    ? "bg-green-100 text-green-700 border-green-200"
                    : o.estado === "enviado"
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
            {o.cliente_nombre && <p className="font-semibold text-slate-700">👤 {o.cliente_nombre}</p>}
            <p>📍 {o.direccion_entrega}</p>
            <p className="font-bold text-emerald-600">💰 Total: ${o.monto}</p>
          </div>

          {o.estado === "enviado" && tracking && (
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
