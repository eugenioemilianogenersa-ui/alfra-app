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
  repartidor_nombre?: string | null; // ✅ NUEVO
};

type DeliveryLocation = {
  lat: number;
  lng: number;
};

const ACTIVE_STATES = ["pendiente", "en preparación", "listo para entregar", "enviado"];

function estadoBadgeClass(estado?: string | null) {
  switch (estado) {
    case "pendiente":
      return "bg-slate-200 text-slate-800 border-slate-300";
    case "en preparación":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "listo para entregar":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "enviado":
      return "bg-yellow-100 text-yellow-900 border-yellow-300";
    case "entregado":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelado":
      return "bg-red-100 text-red-900 border-red-300";
    default:
      return "bg-slate-200 text-slate-800 border-slate-300";
  }
}

function estadoLeftBorder(estado?: string | null) {
  switch (estado) {
    case "pendiente":
      return "border-l-slate-400";
    case "en preparación":
      return "border-l-orange-500";
    case "listo para entregar":
      return "border-l-blue-500";
    case "enviado":
      return "border-l-yellow-500";
    case "entregado":
      return "border-l-emerald-600";
    case "cancelado":
      return "border-l-red-600";
    default:
      return "border-l-slate-400";
  }
}

export default function MisPedidosClient() {
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);

  const [activeDeliveryId, setActiveDeliveryId] = useState<number | null>(null);
  const [tracking, setTracking] = useState<DeliveryLocation | null>(null);

  const userIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // ✅ Enriquecer orders con nombre de repartidor (deliveries -> profiles)
  const enrichWithDeliveryName = async (rows: any[]): Promise<Order[]> => {
    if (!rows?.length) return [];

    const orderIds = rows.map((o) => o.id);

    const { data: del, error: dErr } = await supabase
      .from("deliveries")
      .select("order_id, delivery_user_id")
      .in("order_id", orderIds);

    if (dErr) {
      console.error("Error deliveries:", dErr.message);
      return rows as Order[];
    }

    if (!del?.length) {
      return rows.map((o) => ({ ...(o as Order), repartidor_nombre: null }));
    }

    const uids = [...new Set(del.map((d: any) => d.delivery_user_id))].filter(Boolean);

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", uids as string[]);

    if (pErr) {
      console.error("Error profiles:", pErr.message);
      return rows as Order[];
    }

    const nameByUser: Record<string, string> = {};
    prof?.forEach((p: any) => {
      nameByUser[p.id] = p.display_name || p.email?.split("@")[0] || "Repartidor";
    });

    const nameByOrder: Record<number, string> = {};
    del.forEach((d: any) => {
      if (d?.order_id && d?.delivery_user_id) {
        nameByOrder[d.order_id] = nameByUser[d.delivery_user_id] || "Repartidor";
      }
    });

    return rows.map((o) => ({
      ...(o as Order),
      repartidor_nombre: nameByOrder[o.id] ?? null,
    }));
  };

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

    const enriched = await enrichWithDeliveryName((data as any[]) ?? []);
    setOrders(enriched);
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

    if (activeDeliveryId) {
      await fetchLastLocation(activeDeliveryId);
    }
  };

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

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`client-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async () => {
        await refreshAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeDeliveryId]);

  useEffect(() => {
    if (!userId) return;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshAll();
    };

    const id = window.setInterval(tick, 3000);
    pollRef.current = id;

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeDeliveryId]);

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
        <div
          key={o.id}
          className={`bg-white border rounded-xl shadow-sm overflow-hidden border-l-4 ${estadoLeftBorder(o.estado)}`}
        >
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-slate-800">Pedido #{o.id}</h2>
              <p className="text-xs text-slate-400">{new Date(o.creado_en).toLocaleDateString("es-AR")}</p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border uppercase tracking-wide ${estadoBadgeClass(
                o.estado
              )}`}
            >
              {o.estado}
            </span>
          </div>

          <div className="p-4 space-y-2 text-sm text-slate-600">
            {o.cliente_nombre && <p className="font-semibold text-slate-700">👤 {o.cliente_nombre}</p>}
            <p>📍 {o.direccion_entrega}</p>
            <p className="font-bold text-emerald-600">💰 Total: ${o.monto}</p>

            {/* ✅ MOSTRAR DELIVERY */}
            {o.repartidor_nombre && (
              <p className="font-semibold text-slate-700">🛵 Delivery: {o.repartidor_nombre}</p>
            )}
          </div>

          {o.estado === "enviado" && tracking && (
            <div className="border-t">
              <div className="bg-yellow-100 p-2 text-center text-xs font-extrabold text-yellow-900 flex items-center justify-center gap-2 border-b border-yellow-200">
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
