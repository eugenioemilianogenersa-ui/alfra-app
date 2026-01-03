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

  delivery_nombre?: string | null;
  repartidor_nombre?: string | null;
};

type DeliveryLocation = { lat: number; lng: number };

type DeliveryLocationRow = {
  id?: number;
  delivery_id: number;
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
  const userIdRef = useRef<string | null>(null);

  const [activeDeliveryIds, setActiveDeliveryIds] = useState<number[]>([]);
  const [trackingByOrderId, setTrackingByOrderId] = useState<Record<number, DeliveryLocation | null>>({});

  // order_id -> delivery_id
  const deliveryIdByOrderIdRef = useRef<Record<number, number>>({});
  // delivery_id -> order_id
  const orderIdByDeliveryIdRef = useRef<Record<number, number>>({});

  // UI estado botón
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [updateMsgByOrderId, setUpdateMsgByOrderId] = useState<Record<number, string>>({});

  const enrichWithDeliveryNameFallback = async (rows: any[]): Promise<Order[]> => {
    if (!rows?.length) return [];
    const needFallback = rows.some((o) => !o.delivery_nombre);
    if (!needFallback) return rows as Order[];

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
      .select("id, cliente_nombre, direccion_entrega, monto, estado, creado_en, delivery_nombre")
      .eq("user_id", uid)
      .in("estado", ACTIVE_STATES)
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargando orders:", error.message);
      return;
    }

    const enriched = await enrichWithDeliveryNameFallback((data as any[]) ?? []);
    setOrders(enriched);
  };

  const fetchLastLocation = async (deliveryId: number): Promise<DeliveryLocation | null> => {
    const { data: loc, error } = await supabase
      .from("delivery_locations")
      .select("lat, lng")
      .eq("delivery_id", deliveryId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error last location:", error.message);
      return null;
    }

    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  };

  const refreshActiveDelivery = async (uid: string): Promise<Record<number, DeliveryLocation | null>> => {
    const { data: currentOrders, error: oErr } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", uid)
      .eq("estado", "enviado")
      .order("id", { ascending: false });

    if (oErr) console.error("Error currentOrders:", oErr.message);

    if (!currentOrders?.length) {
      deliveryIdByOrderIdRef.current = {};
      orderIdByDeliveryIdRef.current = {};
      setActiveDeliveryIds([]);
      setTrackingByOrderId({});
      return {};
    }

    const orderIds = currentOrders.map((o) => o.id);

    const { data: deliveryRows, error: dErr } = await supabase
      .from("deliveries")
      .select("id, order_id")
      .in("order_id", orderIds);

    if (dErr) console.error("Error buscando deliveries:", dErr.message);

    const nextDeliveryIdByOrderId: Record<number, number> = {};
    const nextOrderIdByDeliveryId: Record<number, number> = {};
    const deliveryIds: number[] = [];

    (deliveryRows ?? []).forEach((row) => {
      if (!row?.id || !row?.order_id) return;
      const deliveryId = Number(row.id);
      const orderId = Number(row.order_id);

      nextDeliveryIdByOrderId[orderId] = deliveryId;
      nextOrderIdByDeliveryId[deliveryId] = orderId;
      deliveryIds.push(deliveryId);
    });

    deliveryIdByOrderIdRef.current = nextDeliveryIdByOrderId;
    orderIdByDeliveryIdRef.current = nextOrderIdByDeliveryId;
    setActiveDeliveryIds(deliveryIds);

    if (!deliveryIds.length) {
      setTrackingByOrderId((prev) => {
        const next: Record<number, DeliveryLocation | null> = {};
        orderIds.forEach((orderId) => (next[orderId] = prev[orderId] ?? null));
        return next;
      });
      return {};
    }

    const { data: locations, error: lErr } = await supabase
      .from("delivery_locations")
      .select("delivery_id, lat, lng, id")
      .in("delivery_id", deliveryIds)
      .order("id", { ascending: false });

    if (lErr) console.error("Error buscando locations:", lErr.message);

    const latestByDeliveryId: Record<number, DeliveryLocation> = {};
    (locations ?? []).forEach((loc) => {
      if (!loc?.delivery_id || latestByDeliveryId[loc.delivery_id]) return;
      latestByDeliveryId[loc.delivery_id] = { lat: loc.lat, lng: loc.lng };
    });

    const nextTrackingByOrderId: Record<number, DeliveryLocation | null> = {};
    orderIds.forEach((orderId) => {
      const did = nextDeliveryIdByOrderId[orderId];
      nextTrackingByOrderId[orderId] = did ? latestByDeliveryId[did] ?? null : null;
    });

    setTrackingByOrderId(nextTrackingByOrderId);
    return nextTrackingByOrderId;
  };

  const refreshAll = async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await loadOrders(uid);
    await refreshActiveDelivery(uid);
  };

  // ✅ BOTÓN: actualizar ubicación “ya”
  const handleManualRefreshLocation = async (orderId: number) => {
    const deliveryId = deliveryIdByOrderIdRef.current[orderId];
    if (!deliveryId) {
      setUpdateMsgByOrderId((prev) => ({ ...prev, [orderId]: "⚠️ Aún no hay delivery asignado." }));
      window.setTimeout(() => {
        setUpdateMsgByOrderId((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }, 2500);
      return;
    }

    setUpdatingOrderId(orderId);
    setUpdateMsgByOrderId((prev) => ({ ...prev, [orderId]: "Actualizando..." }));

    try {
      const latest = await fetchLastLocation(deliveryId);
      if (!latest) {
        setUpdateMsgByOrderId((prev) => ({ ...prev, [orderId]: "⚠️ Sin señal del delivery aún." }));
        return;
      }

      setTrackingByOrderId((prev) => ({ ...prev, [orderId]: latest }));
      setUpdateMsgByOrderId((prev) => ({ ...prev, [orderId]: "✅ Ubicación actualizada" }));
    } finally {
      setUpdatingOrderId(null);
      window.setTimeout(() => {
        setUpdateMsgByOrderId((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }, 2500);
    }
  };

  // INIT
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;

      setUserId(uid);
      userIdRef.current = uid;

      if (!uid) {
        setOrders([]);
        setTrackingByOrderId({});
        setActiveDeliveryIds([]);
        setLoading(false);
        return;
      }

      await refreshAll();
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // REALTIME: orders + deliveries
  useEffect(() => {
    if (!userId) return;

    const ch = supabase
      .channel(`client-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` }, async () => {
        await refreshAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async () => {
        await refreshAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // REALTIME locations: payload.new
  useEffect(() => {
    if (!activeDeliveryIds.length) return;

    const channels = activeDeliveryIds.map((deliveryId) =>
      supabase
        .channel(`client-loc-${deliveryId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "delivery_locations", filter: `delivery_id=eq.${deliveryId}` },
          async (payload) => {
            const row = (payload?.new ?? null) as DeliveryLocationRow | null;
            if (!row) return;

            const did = Number(row.delivery_id);
            const latest: DeliveryLocation = { lat: Number(row.lat), lng: Number(row.lng) };

            let orderId = orderIdByDeliveryIdRef.current[did];
            if (!orderId) {
              const map = deliveryIdByOrderIdRef.current;
              const found = Object.keys(map).find((k) => map[Number(k)] === did);
              orderId = found ? Number(found) : 0;
            }
            if (!orderId) return;

            setTrackingByOrderId((prev) => ({ ...prev, [orderId]: latest }));
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeliveryIds.join(",")]);

  // FALLBACK polling suave 4s
  useEffect(() => {
    if (!activeDeliveryIds.length) return;

    let alive = true;

    const tick = async () => {
      if (!alive) return;

      const dids = [...activeDeliveryIds];
      for (const did of dids) {
        const latest = await fetchLastLocation(did);
        if (!latest) continue;

        let orderId = orderIdByDeliveryIdRef.current[did];
        if (!orderId) {
          const map = deliveryIdByOrderIdRef.current;
          const found = Object.keys(map).find((k) => map[Number(k)] === did);
          orderId = found ? Number(found) : 0;
        }
        if (!orderId) continue;

        setTrackingByOrderId((prev) => {
          const prevLoc = prev[orderId];
          if (prevLoc && prevLoc.lat === latest.lat && prevLoc.lng === latest.lng) return prev;
          return { ...prev, [orderId]: latest };
        });
      }
    };

    tick();
    const iv = window.setInterval(tick, 4000);

    return () => {
      alive = false;
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeliveryIds.join(",")]);

  if (loading) return <div className="p-6 text-center">Cargando mis pedidos...</div>;

  return (
    <div className="p-6 space-y-6 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-slate-800">Mis Pedidos</h1>

      {orders.length === 0 && (
        <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
          <p>No tenés pedidos activos en este momento.</p>
        </div>
      )}

      {orders.map((o) => {
        const deliveryName = o.delivery_nombre || o.repartidor_nombre || null;
        const hasTracking = o.estado === "enviado" && trackingByOrderId[o.id];

        return (
          <div
            key={o.id}
            className={`bg-white border rounded-xl shadow-sm overflow-hidden border-l-4 ${estadoLeftBorder(o.estado)}`}
          >
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Pedido #{o.id}</h2>
                <p className="text-xs text-slate-400">{new Date(o.creado_en).toLocaleDateString("es-AR")}</p>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-extrabold border uppercase tracking-wide ${estadoBadgeClass(o.estado)}`}>
                {o.estado}
              </span>
            </div>

            <div className="p-4 space-y-2 text-sm text-slate-600">
              {o.cliente_nombre && <p className="font-semibold text-slate-700">👤 {o.cliente_nombre}</p>}
              <p>📍 {o.direccion_entrega}</p>
              <p className="font-bold text-emerald-600">💰 Total: ${o.monto}</p>
              {deliveryName && <p className="font-semibold text-slate-700">🛵 Delivery: {deliveryName}</p>}
            </div>

            {o.estado === "enviado" && hasTracking && (
              <div className="border-t">
                <div className="bg-yellow-100 p-2 text-center text-xs font-extrabold text-yellow-900 flex items-center justify-center gap-2 border-b border-yellow-200">
                  🛵 TU PEDIDO ESTÁ EN CAMINO
                </div>

                <DeliveryMap lat={trackingByOrderId[o.id]!.lat} lng={trackingByOrderId[o.id]!.lng} />

                {/* ✅ CTA: Actualizar ubicación */}
                <div className="p-3 bg-white border-t">
                  <button
                    onClick={() => handleManualRefreshLocation(o.id)}
                    disabled={updatingOrderId === o.id}
                    className="w-full bg-slate-900 hover:bg-slate-950 active:bg-black text-white font-extrabold py-3 rounded-lg shadow transition-transform active:scale-95 disabled:opacity-60"
                  >
                    {updatingOrderId === o.id ? "⏳ Actualizando..." : "🔄 Actualizar ubicación del delivery"}
                  </button>

                  {updateMsgByOrderId[o.id] && (
                    <p className="mt-2 text-center text-xs font-bold text-slate-600">
                      {updateMsgByOrderId[o.id]}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
