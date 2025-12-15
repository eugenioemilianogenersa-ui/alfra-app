"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";

type Order = {
  id: number;
  cliente_nombre: string;
  direccion_entrega: string;
  monto: number;
  estado: string;
};

type DeliveryItem = {
  id: number;
  order_id: number;
  orders: Order;
};

const ACTIVE_STATES = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
];

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

function estadoHeaderClass(estado?: string | null) {
  switch (estado) {
    case "pendiente":
      return "bg-slate-800";
    case "en preparación":
      return "bg-orange-600";
    case "listo para entregar":
      return "bg-blue-700";
    case "enviado":
      return "bg-yellow-600";
    case "entregado":
      return "bg-emerald-700";
    case "cancelado":
      return "bg-red-700";
    default:
      return "bg-slate-800";
  }
}

function estadoRingClass(estado?: string | null) {
  switch (estado) {
    case "en preparación":
      return "ring-2 ring-orange-400";
    case "listo para entregar":
      return "ring-2 ring-blue-400";
    case "enviado":
      return "ring-2 ring-yellow-400";
    case "entregado":
      return "ring-2 ring-emerald-400";
    case "cancelado":
      return "ring-2 ring-red-400";
    default:
      return "";
  }
}

export default function DeliveryClient() {
  const supabase = createClient();
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const deliveryIdActiveRef = useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;

      setMyUserId(uid);

      if (!uid) {
        setLoading(false);
        return;
      }

      await fetchMyDeliveries(uid);
      setLoading(false);
    };

    init();

    const channel = supabase
      .channel("delivery-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => {
          if (myUserId) fetchMyDeliveries(myUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (myUserId) fetchMyDeliveries(myUserId);
        }
      )
      .subscribe();

    return () => {
      stopTracking();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId]);

  const fetchMyDeliveries = async (uid: string) => {
    try {
      const { data: misAsignaciones, error: asignError } = await supabase
        .from("deliveries")
        .select("id, order_id, delivery_user_id")
        .eq("delivery_user_id", uid);

      if (asignError) console.error("Error deliveries:", asignError);

      if (!misAsignaciones || misAsignaciones.length === 0) {
        setItems([]);
        setLoading(false);
        stopTracking();
        return;
      }

      const orderIds = misAsignaciones.map((d) => d.order_id);

      const { data: ordenesDetalle, error: ordError } = await supabase
        .from("orders")
        .select("*")
        .in("id", orderIds)
        .in("estado", ACTIVE_STATES)
        .order("id", { ascending: false });

      if (ordError) console.error("Error orders:", ordError);

      const listaFinal: DeliveryItem[] = [];
      misAsignaciones.forEach((asignacion) => {
        const ordenEncontrada = ordenesDetalle?.find(
          (o) => o.id === asignacion.order_id
        );
        if (ordenEncontrada) {
          listaFinal.push({
            id: asignacion.id,
            order_id: asignacion.order_id,
            orders: ordenEncontrada as Order,
          });
        }
      });

      setItems(listaFinal);

      const active = listaFinal.find((d) => d.orders.estado === "enviado");
      if (active && !isTracking) startTracking(active.id);
      else if (!active && isTracking) stopTracking();
    } catch (error: any) {
      console.error("Error fetchMyDeliveries:", error);
    } finally {
      setLoading(false);
    }
  };

  const startTracking = (deliveryTableId: number) => {
    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta GPS.");
      return;
    }
    if (isTracking) return;

    setIsTracking(true);
    setGpsError(null);
    deliveryIdActiveRef.current = deliveryTableId;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    };

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        setGpsError(null);
        const { latitude, longitude } = position.coords;

        await supabase.from("delivery_locations").insert({
          delivery_id: deliveryIdActiveRef.current,
          lat: latitude,
          lng: longitude,
        });
      },
      (err) => {
        console.error("Error GPS:", err);
        const msg =
          (err as GeolocationPositionError).message ||
          "Problema con GPS (¿sin HTTPS?).";
        setGpsError(`Problema con GPS: ${msg}`);
      },
      options
    );

    watchIdRef.current = id;
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    deliveryIdActiveRef.current = null;
    setGpsError(null);
  };

  const handleComenzarViaje = async (orderId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.orders.id === orderId
          ? { ...item, orders: { ...item.orders, estado: "enviado" } }
          : item
      )
    );

    await supabase
      .from("orders")
      .update({
        estado: "enviado",
        estado_source: "APP_DELIVERY",
      })
      .eq("id", orderId);

    // ✅ PUSH al cliente: pedido enviado
    await fetch("/api/push/notify-order-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, estado: "enviado" }),
    });
  };

  const handleEntregar = async (orderId: number) => {
    const confirmEntregar = window.confirm("¿Pedido entregado?");
    if (!confirmEntregar) return;

    setItems((prev) => prev.filter((item) => item.orders.id !== orderId));

    await supabase
      .from("orders")
      .update({
        estado: "entregado",
        estado_source: "APP_DELIVERY",
      })
      .eq("id", orderId);

    // ✅ PUSH al cliente: pedido entregado
    await fetch("/api/push/notify-order-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, estado: "entregado" }),
    });

    stopTracking();
  };

  if (loading)
    return <div className="p-6 text-center text-slate-500">Cargando...</div>;

  return (
    <div className="p-4 pb-24 space-y-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">
          🛵 Panel Repartidor
        </h1>
        {isTracking && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200 animate-pulse">
            ● GPS ACTIVO
          </span>
        )}
      </div>

      {gpsError && (
        <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded text-sm">
          ⚠️ {gpsError}
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-xl bg-white">
          <p>😴 Sin pedidos pendientes.</p>
        </div>
      )}

      {items.map((item) => {
        const order = item.orders;

        return (
          <div
            key={item.id}
            className={`border rounded-xl shadow-sm overflow-hidden bg-white ${estadoRingClass(
              order.estado
            )}`}
          >
            <div
              className={`${estadoHeaderClass(
                order.estado
              )} text-white p-4 flex justify-between items-center`}
            >
              <span className="font-bold text-lg">#{order.id}</span>

              <span
                className={`text-[11px] px-2 py-1 rounded-full uppercase font-bold border ${estadoBadgeClass(
                  order.estado
                )}`}
                style={{ backgroundColor: "rgba(255,255,255,0.9)" }}
              >
                {order.estado}
              </span>
            </div>

            <div className="p-4 space-y-2">
              <p className="text-lg font-bold text-slate-800">
                {order.cliente_nombre}
              </p>
              <p className="text-sm text-slate-600">
                📍 {order.direccion_entrega}
              </p>

              <div className="pt-2 flex justify-between items-center">
                <p className="text-2xl text-emerald-600 font-bold">
                  ${order.monto}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    (order.direccion_entrega || "") +
                      " Coronel Moldes Cordoba"
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 text-xs underline"
                >
                  Abrir Mapa
                </a>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t">
              {order.estado !== "enviado" && (
                <button
                  onClick={() => handleComenzarViaje(order.id)}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black font-extrabold py-3 rounded-lg shadow transition-transform active:scale-95"
                >
                  🚀 SALIR
                </button>
              )}

              {order.estado === "enviado" && (
                <button
                  onClick={() => handleEntregar(order.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold py-3 rounded-lg shadow transition-transform active:scale-95"
                >
                  ✅ ENTREGAR
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
