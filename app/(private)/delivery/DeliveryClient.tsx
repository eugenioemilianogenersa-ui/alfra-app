"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
import { updateOrderStatus } from "@/lib/updateOrderStatus";

type Order = {
  id: number;
  cliente_nombre: string;
  direccion_entrega: string;
  monto: number;
  estado: string;
  creado_en: string;
  cliente_phone_normalized?: string | null;
};

type DeliveryItem = {
  id: number;
  order_id: number;
  orders: Order;
};

const ACTIVE_STATES = ["pendiente", "en preparación", "listo para entregar", "enviado"];

// --- HELPERS VISUALES ---
function estadoBadgeClass(estado?: string | null) {
  switch (estado) {
    case "pendiente": return "bg-slate-200 text-slate-800 border-slate-300";
    case "en preparación": return "bg-orange-100 text-orange-800 border-orange-200";
    case "listo para entregar": return "bg-blue-100 text-blue-800 border-blue-200";
    case "enviado": return "bg-yellow-100 text-yellow-900 border-yellow-300";
    case "entregado": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelado": return "bg-red-100 text-red-900 border-red-300";
    default: return "bg-slate-200 text-slate-800 border-slate-300";
  }
}

function estadoHeaderClass(estado?: string | null) {
  switch (estado) {
    case "pendiente": return "bg-slate-800";
    case "en preparación": return "bg-orange-600";
    case "listo para entregar": return "bg-blue-700";
    case "enviado": return "bg-yellow-600";
    case "entregado": return "bg-emerald-700";
    case "cancelado": return "bg-red-700";
    default: return "bg-slate-800";
  }
}

function estadoRingClass(estado?: string | null) {
  switch (estado) {
    case "en preparación": return "ring-2 ring-orange-400";
    case "listo para entregar": return "ring-2 ring-blue-400";
    case "enviado": return "ring-2 ring-yellow-400";
    case "entregado": return "ring-2 ring-emerald-400";
    case "cancelado": return "ring-2 ring-red-400";
    default: return "";
  }
}

const formatFechaArgentina = (fechaString: string) => {
  if (!fechaString) return "";
  const fecha = new Date(fechaString.endsWith("Z") ? fechaString : fechaString + "Z");
  return fecha.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
};

// --- NUEVO HELPER DE WHATSAPP ---
// Corrige el error de "Finlandia" (+358) forzando Argentina (+549)
const crearLinkWhatsApp = (numeroRaw?: string | null) => {
  if (!numeroRaw) return "#";
  
  // 1. Limpiamos todo lo que no sea número (sacamos +, espacios, guiones)
  let limpio = numeroRaw.replace(/\D/g, "");

  // 2. Si el número ya empieza con 54, asumimos que está bien.
  // Si NO empieza con 54, le agregamos el 549 (Argentina Móvil) adelante.
  // Ejemplo: "3582407438" -> se convierte en "5493582407438"
  if (!limpio.startsWith("54")) {
    limpio = `549${limpio}`;
  }

  return `https://wa.me/${limpio}`;
};

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
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => { if (myUserId) fetchMyDeliveries(myUserId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { if (myUserId) fetchMyDeliveries(myUserId); })
      .subscribe();

    return () => {
      stopTracking();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line
  }, [myUserId]);

  const fetchMyDeliveries = async (uid: string) => {
    try {
      const { data: misAsignaciones } = await supabase
        .from("deliveries")
        .select("id, order_id, delivery_user_id")
        .eq("delivery_user_id", uid);

      if (!misAsignaciones || misAsignaciones.length === 0) {
        setItems([]);
        setLoading(false);
        stopTracking();
        return;
      }

      const orderIds = misAsignaciones.map((d) => d.order_id);

      const { data: ordenesDetalle } = await supabase
        .from("orders")
        .select("*")
        .in("id", orderIds)
        .in("estado", ACTIVE_STATES)
        .order("id", { ascending: false });

      const listaFinal: DeliveryItem[] = [];
      misAsignaciones.forEach((asignacion) => {
        const ordenEncontrada = ordenesDetalle?.find((o) => o.id === asignacion.order_id);
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startTracking = async (deliveryTableId: number) => {
    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta GPS.");
      return;
    }
    if (isTracking) return;

    deliveryIdActiveRef.current = deliveryTableId;
    setGpsError(null);

    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state === "denied") {
          setGpsError("Permiso de GPS denegado. Actívalo para continuar.");
          setIsTracking(false);
          deliveryIdActiveRef.current = null;
          watchIdRef.current = null;
          return;
        }
      } catch (error) {
        console.warn("No se pudo verificar permisos de GPS.", error);
      }
    }

    setIsTracking(true);
    const options: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    const id = navigator.geolocation.watchPosition(
      async (position) => {
        setGpsError(null);
        const { latitude, longitude } = position.coords;
        const did = deliveryIdActiveRef.current;
        if (!did) return;

        await supabase.from("delivery_locations").insert({ delivery_id: did, lat: latitude, lng: longitude });
      },
      (err) => {
        const msg = (err as GeolocationPositionError).message || "Error GPS.";
        setGpsError(`Problema con GPS: ${msg}`);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setIsTracking(false);
        deliveryIdActiveRef.current = null;
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
    setItems((prev) => prev.map((item) => item.orders.id === orderId ? { ...item, orders: { ...item.orders, estado: "enviado" } } : item));
    try {
      await updateOrderStatus({ orderId, estado: "enviado", source: "APP_DELIVERY" });
      await fetch("/api/push/notify-order-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, estado: "enviado" }) });
    } catch {
        if (myUserId) await fetchMyDeliveries(myUserId);
        alert("Error al iniciar viaje.");
    }
  };

  const handleEntregar = async (orderId: number) => {
    if (!window.confirm("¿Pedido entregado?")) return;
    setItems((prev) => prev.filter((item) => item.orders.id !== orderId));
    try {
      await updateOrderStatus({ orderId, estado: "entregado", source: "APP_DELIVERY" });
      await fetch("/api/push/notify-order-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, estado: "entregado" }) });
      stopTracking();
    } catch {
        if (myUserId) await fetchMyDeliveries(myUserId);
        alert("Error al finalizar entrega.");
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-500">Cargando...</div>;

  return (
    <div className="p-4 pb-24 space-y-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">🛵 Panel Repartidor</h1>
        {isTracking && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200 animate-pulse">● GPS ACTIVO</span>}
      </div>

      {gpsError && <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded text-sm">⚠️ {gpsError}</div>}

      {items.length === 0 && (
        <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-xl bg-white">
          <p>😴 Sin pedidos pendientes.</p>
        </div>
      )}

      {items.map((item) => {
        const order = item.orders;
        const phone = order.cliente_phone_normalized;

        return (
          <div key={item.id} className={`border rounded-xl shadow-sm overflow-hidden bg-white ${estadoRingClass(order.estado)}`}>
            <div className={`${estadoHeaderClass(order.estado)} text-white p-4 flex justify-between items-center`}>
              <span className="font-bold text-lg">#{order.id}</span>
              <span className={`text-[11px] px-2 py-1 rounded-full uppercase font-bold border ${estadoBadgeClass(order.estado)}`} style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
                {order.estado}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <p className="text-lg font-bold text-slate-800 leading-tight">{order.cliente_nombre}</p>
                <div className="flex items-center gap-1 text-slate-500 text-xs mt-1">
                    <span>🕒</span>
                    <span>Cargado: {formatFechaArgentina(order.creado_en)}</span>
                </div>
              </div>
              
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-700 font-medium">📍 {order.direccion_entrega}</p>
                  <div className="flex justify-between items-center mt-2">
                     <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((order.direccion_entrega || "") + " Coronel Moldes Cordoba")}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-bold underline flex items-center gap-1">
                        🗺️ Abrir Mapa
                     </a>
                     <p className="text-xl text-emerald-600 font-bold">${order.monto}</p>
                  </div>
              </div>

              {phone && (
                  <div className="grid grid-cols-2 gap-2">
                      <a href={`tel:${phone}`} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-bold transition-colors">
                          📞 Llamar
                      </a>
                      {/* Usamos el helper crearLinkWhatsApp aquí */}
                      <a href={crearLinkWhatsApp(phone)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-green-100 hover:bg-green-200 text-green-800 py-2 rounded-lg text-sm font-bold transition-colors">
                          💬 WhatsApp
                      </a>
                  </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t">
              {order.estado !== "enviado" && (
                <button onClick={() => handleComenzarViaje(order.id)} className="w-full bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black font-extrabold py-3 rounded-lg shadow transition-transform active:scale-95">
                  🚀 SALIR HACIA CLIENTE
                </button>
              )}

              {order.estado === "enviado" && (
                <button onClick={() => handleEntregar(order.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold py-3 rounded-lg shadow transition-transform active:scale-95">
                  ✅ CONFIRMAR ENTREGA
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
