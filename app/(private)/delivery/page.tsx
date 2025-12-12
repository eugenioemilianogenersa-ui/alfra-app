"use client";
export const dynamic = "force-dynamic";

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

export default function DeliveryPage() {
  const supabase = createClient();
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const deliveryIdActiveRef = useRef<number | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setMyUserId(data.user.id);
        fetchMyDeliveries(data.user.id);
      } else {
        setLoading(false);
      }
    };

    getUser();

    const channel = supabase
      .channel("delivery-updates")
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

  // ---------- AUTO-REFRESH CADA 5s (POR SI FALLA REALTIME) ----------
  useEffect(() => {
    if (!myUserId) return;

    const intervalId = setInterval(() => {
      fetchMyDeliveries(myUserId);
    }, 5_000);

    return () => clearInterval(intervalId);
  }, [myUserId]);

  const fetchMyDeliveries = async (uid: string) => {
    try {
      const { data: misAsignaciones, error: asignError } = await supabase
        .from("deliveries")
        .select("id, order_id, delivery_user_id")
        .eq("delivery_user_id", uid);

      if (asignError) {
        console.error("Error deliveres:", asignError);
      }

      if (!misAsignaciones || misAsignaciones.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const orderIds = misAsignaciones.map((d) => d.order_id);

      const { data: ordenesDetalle, error: ordError } = await supabase
        .from("orders")
        .select("*")
        .in("id", orderIds)
        .in("estado", [
          "pendiente",
          "en preparación",
          "listo para entregar",
          "en camino",
          "enviado",
          "asignado",
        ])
        .order("id", { ascending: false });

      if (ordError) {
        console.error("Error orders:", ordError);
      }

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

      const active = listaFinal.find(
        (d) =>
          d.orders.estado === "en camino" || d.orders.estado === "enviado"
      );
      if (active && !isTracking) {
        startTracking(active.id);
      } else if (!active && isTracking) {
        stopTracking();
      }
    } catch (error: any) {
      console.error("Error fetch:", error);
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
        if ((err as GeolocationPositionError).code === 3) {
          setGpsError("GPS lento. Intentando modo bajo consumo...");
        } else {
          const msg =
            (err as GeolocationPositionError).message ||
            "Problema con GPS (¿origen no seguro / sin HTTPS?).";
          setGpsError(`Problema con GPS: ${msg}`);
        }
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
      prev.map((item) => {
        if (item.orders.id === orderId) {
          return {
            ...item,
            orders: { ...item.orders, estado: "enviado" }, // alineado con Fudo (viaje iniciado)
          };
        }
        return item;
      })
    );

    await supabase
      .from("orders")
      .update({ estado: "enviado" })
      .eq("id", orderId);
  };

  const handleEntregar = async (orderId: number) => {
    const confirmEntregar = window.confirm("¿Pedido entregado?");
    if (!confirmEntregar) return;

    setItems((prev) => prev.filter((item) => item.orders.id !== orderId));

    await supabase
      .from("orders")
      .update({ estado: "entregado" })
      .eq("id", orderId);

    stopTracking();
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Cargando...
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">
          🛵 Panel Repartidor
        </h1>
        {isTracking && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded animate-pulse border border-green-200">
            ● GPS ACTIVO
          </span>
        )}
      </div>

      {gpsError && (
        <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded text-sm">
          ⚠️ {gpsError}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-xl bg-white">
          <p>😴 Sin pedidos pendientes.</p>
        </div>
      )}

      {items.map((item) => {
        const order = item.orders;
        const isEnCamino =
          order.estado === "en camino" || order.estado === "enviado";

        return (
          <div
            key={item.id}
            className={`border rounded-xl shadow-sm overflow-hidden bg-white ${
              isEnCamino ? "ring-2 ring-blue-500" : ""
            }`}
          >
            <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
              <span className="font-bold text-lg">#{order.id}</span>
              <span
                className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                  isEnCamino
                    ? "bg-blue-500 text-white"
                    : "bg-slate-600 text-slate-200"
                }`}
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
                  className="text-blue-600 text-xs underline"
                >
                  Abrir Mapa
                </a>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t">
              {!isEnCamino && (
                <button
                  onClick={() => handleComenzarViaje(order.id)}
                  className="w-full bg-blue-600 active:bg-blue-800 text-white font-bold py-3 rounded-lg shadow transition-transform active:scale-95"
                >
                  🚀 SALIR
                </button>
              )}
              {isEnCamino && (
                <button
                  onClick={() => handleEntregar(order.id)}
                  className="w-full bg-emerald-600 active:bg-emerald-800 text-white font-bold py-3 rounded-lg shadow transition-transform active:scale-95"
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
