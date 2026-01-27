"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { updateOrderStatus } from "@/lib/updateOrderStatus";

type Order = {
  id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  estado: string | null;
  creado_en: string;
  cliente_phone_normalized?: string | null;
  delivery_nombre?: string | null;
  repartidor_nombre?: string | null;
  estado_source?: string | null;
  source?: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

type AdminFilterMode = "LIVE" | "DATE" | "ID" | "ALL";

const ESTADOS = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
];

const estadoBadgeClass = (e?: string | null) =>
  ({
    pendiente: "bg-slate-100 text-slate-600 border-slate-200",
    "en preparación": "bg-orange-50 text-orange-700 border-orange-200 font-medium",
    "listo para entregar": "bg-blue-50 text-blue-700 border-blue-200 font-medium",
    enviado: "bg-yellow-50 text-yellow-700 border-yellow-200",
    entregado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelado: "bg-red-50 text-red-700 border-red-200 line-through decoration-red-400",
  } as any)[e ?? ""] ?? "bg-slate-100 text-slate-800 border-slate-200";

const estadoLeftBorder = (e?: string | null) =>
  ({
    pendiente: "border-l-slate-300",
    "en preparación": "border-l-orange-500",
    "listo para entregar": "border-l-blue-500",
    enviado: "border-l-yellow-400",
    entregado: "border-l-emerald-500",
    cancelado: "border-l-red-500",
  } as any)[e ?? ""] ?? "border-l-slate-300";

// ✅ Turno bar: 19:00 -> 02:00 (cruza medianoche)
// - Si ahora está fuera de turno (02:00..18:59) => null (mostrar vacío)
const getShiftRangeISO = (): { start: string; end: string } | null => {
  const now = new Date();
  const h = now.getHours();

  // Fuera de turno: 02:00..18:59
  if (h >= 2 && h < 19) return null;

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  const base = `${y}-${m}-${d}`;
  const tz = "-03:00";

  if (h >= 19) {
    const start = new Date(`${base}T19:00:00${tz}`);
    const end = new Date(`${base}T02:00:00${tz}`);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  } else {
    const end = new Date(`${base}T02:00:00${tz}`);
    const start = new Date(`${base}T19:00:00${tz}`);
    start.setDate(start.getDate() - 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
};

// ✅ FIX DATE: rango ISO (timestamptz friendly) usando [start, nextDay)
const getDayRangeISO = (dateString: string) => {
  const start = new Date(`${dateString}T00:00:00-03:00`);
  const next = new Date(`${dateString}T00:00:00-03:00`);
  next.setDate(next.getDate() + 1);
  return { start: start.toISOString(), next: next.toISOString() };
};

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

const crearLinkWhatsApp = (numeroRaw?: string | null) => {
  if (!numeroRaw) return "#";
  let limpio = numeroRaw.replace(/\D/g, "");
  if (!limpio.startsWith("54")) limpio = `549${limpio}`;
  return `https://wa.me/${limpio}`;
};

// ✅ Orden robusto: creado_en DESC y desempate por id DESC
const sortOrders = (list: Order[]) => {
  return [...list].sort((a, b) => {
    const ta = new Date(a.creado_en).getTime();
    const tb = new Date(b.creado_en).getTime();
    if (tb !== ta) return tb - ta;
    return (b.id ?? 0) - (a.id ?? 0);
  });
};

export default function AdminPedidosClient() {
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFudo, setSyncingFudo] = useState(false);

  const [myRole, setMyRole] = useState<"admin" | "staff" | null>(null);

  const [adminMode, setAdminMode] = useState<AdminFilterMode>("LIVE");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchId, setSearchId] = useState("");

  const isSyncingRef = useRef(false);
  const last429Ref = useRef<number | null>(null);

  // Guardas para evitar queries superpuestas
  const isFetchingRef = useRef(false);
  const lastFetchAtRef = useRef<number>(0);

  // ✅ refs para evitar "closures viejas" en realtime/polling
  const cargarPedidosRef = useRef<(reps?: Profile[]) => Promise<void>>(async () => {});
  const refreshTimerRef = useRef<number | null>(null);

  const scheduleRefresh = useCallback((ms = 350) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      void cargarPedidosRef.current();
    }, ms);
  }, []);

  const cargarRepartidores = async () => {
    try {
      const res = await fetch("/api/repartidores");
      if (res.ok) {
        const data = await res.json();
        setRepartidores(data);
        return data as Profile[];
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  const enrich = async (orders: any[], currentRepartidores: Profile[]) => {
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);

    const { data: del } = await supabase
      .from("deliveries")
      .select("order_id, delivery_user_id")
      .in("order_id", ids);

    const nameMap: Record<string, string> = {};
    currentRepartidores.forEach((p) => {
      nameMap[p.id] = p.display_name || p.email?.split("@")[0] || "Repartidor";
    });

    const orderToName: Record<number, string> = {};
    del?.forEach((d: any) => {
      if (d.delivery_user_id && nameMap[d.delivery_user_id]) orderToName[d.order_id] = nameMap[d.delivery_user_id];
      else if (d.delivery_user_id) orderToName[d.order_id] = "Repartidor (Cargando...)";
    });

    // no pisar delivery_nombre (denormalizado en orders), solo fallback
    return orders.map((o) => ({ ...o, repartidor_nombre: orderToName[o.id] ?? null }));
  };

  const cargarPedidos = async (repartidoresList?: Profile[]) => {
    if (!myRole) return;

    // evita superposición y reduce spam si entran varios triggers juntos
    const now = Date.now();
    if (isFetchingRef.current) return;
    if (now - lastFetchAtRef.current < 250) return;

    isFetchingRef.current = true;
    lastFetchAtRef.current = now;

    try {
      const repsToUse = repartidoresList || repartidores;

      // ✅ Orden en DB: creado_en DESC, id DESC
      let q = supabase
        .from("orders")
        .select("*")
        .order("creado_en", { ascending: false })
        .order("id", { ascending: false });

      // STAFF siempre trabaja en modo TURNO ACTUAL
      if (myRole === "staff") {
        const shift = getShiftRangeISO();
        if (!shift) {
          setPedidos([]);
          return;
        }
        q = q.gte("creado_en", shift.start).lt("creado_en", shift.end);
      } else {
        if (adminMode === "LIVE") {
          const shift = getShiftRangeISO();
          if (!shift) {
            setPedidos([]);
            return;
          }
          q = q.gte("creado_en", shift.start).lt("creado_en", shift.end);
        } else if (adminMode === "DATE") {
          const { start, next } = getDayRangeISO(selectedDate);
          q = q.gte("creado_en", start).lt("creado_en", next);
        } else if (adminMode === "ID") {
          const n = Number(searchId);
          if (!searchId || Number.isNaN(n)) {
            setPedidos([]);
            return;
          }
          q = q.eq("id", n);
        } else if (adminMode === "ALL") q = q.limit(200);
      }

      const { data, error } = await q;
      if (error) {
        console.error(error.message);
        return;
      }

      const enriched = await enrich(data ?? [], repsToUse);

      // ✅ Orden final en frontend (por si enrich/realtime mezclan)
      setPedidos(sortOrders(enriched as Order[]));
    } finally {
      isFetchingRef.current = false;
    }
  };

  // ✅ mantener SIEMPRE la versión actual de cargarPedidos en un ref (anti "closure vieja")
  useEffect(() => {
    cargarPedidosRef.current = async (reps?: Profile[]) => {
      await cargarPedidos(reps);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRole, adminMode, selectedDate, searchId, repartidores]);

  const syncFudo = async (forced?: boolean) => {
    const now = Date.now();
    if (isSyncingRef.current) return;
    if (!forced && last429Ref.current && now - last429Ref.current < 60000) return;

    try {
      isSyncingRef.current = true;
      setSyncingFudo(true);
      await fetch("/api/fudo/sync");
      await cargarPedidos();
    } catch (e) {
      console.error(e);
    } finally {
      isSyncingRef.current = false;
      setSyncingFudo(false);
    }
  };

  const borrarPedido = async (id: number) => {
    if (!window.confirm("¿Seguro que querés eliminar este pedido permanentemente?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (!error) {
      setPedidos((prev) => prev.filter((p) => p.id !== id));
      setTimeout(() => scheduleRefresh(300), 350);
    }
  };

  const asignarDelivery = async (orderId: number, deliveryUserId: string) => {
    if (!deliveryUserId) return alert("Seleccioná un repartidor");
    await fetch("/api/delivery/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, deliveryUserId }),
    });
    scheduleRefresh(350);
  };

  const cambiarEstado = async (id: number, estado: string) => {
    setPedidos((p) => p.map((o) => (o.id === id ? { ...o, estado } : o)));
    try {
      await updateOrderStatus({
        orderId: id,
        estado,
        source: myRole === "staff" ? "APP_STAFF" : "APP_ADMIN",
      });

      if (["enviado", "entregado", "cancelado"].includes(estado)) {
        await fetch("/api/push/notify-order-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, estado }),
        });
      }
    } catch {
      await cargarPedidos();
      alert("Error al actualizar estado.");
    }
  };

  // INIT: session + role
  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.session.user.id)
        .single();

      const r = String(profile?.role || "").toLowerCase();
      const finalRole = (r === "staff" ? "staff" : "admin") as "staff" | "admin";
      setMyRole(finalRole);

      await cargarRepartidores();

      setLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  // ✅ Realtime: solo si hay turno abierto
  useEffect(() => {
    if (!myRole) return;

    const shift = getShiftRangeISO();
    if (!shift) return;

    const ordersFilter = `creado_en=gte.${shift.start}`;

    const channel = supabase
      .channel(`admin-pedidos-live-${myRole}`)
      .on(
        "postgres_changes",
        myRole === "staff"
          ? ({ event: "*", schema: "public", table: "orders", filter: ordersFilter } as any)
          : ({ event: "*", schema: "public", table: "orders" } as any),
        () => scheduleRefresh(350)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => scheduleRefresh(350))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line
  }, [myRole, scheduleRefresh]);

  // ✅ Refetch cuando cambian filtros / role / repartidores listos
  useEffect(() => {
    if (!loading && myRole) scheduleRefresh(50);
    // eslint-disable-next-line
  }, [adminMode, selectedDate, searchId, myRole, loading, repartidores.length, scheduleRefresh]);

  // ✅ Polling fallback (SUAVE)
  useEffect(() => {
    if (!myRole) return;

    const pollMs = myRole === "staff" ? 20000 : 30000;
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    }, pollMs);

    return () => window.clearInterval(poll);
  }, [myRole, scheduleRefresh]);

  // ✅ Sync Fudo automático MUY lento
  useEffect(() => {
    if (!myRole) return;

    const syncMs = 5 * 60 * 1000;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") syncFudo();
    }, syncMs);

    return () => window.clearInterval(t);
  }, [myRole]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    };
  }, []);

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">Iniciando...</div>;

  const shiftNow = getShiftRangeISO();
  const liveHint =
    adminMode === "LIVE"
      ? shiftNow
        ? "Mostrando pedidos del turno (19:00 a 02:00)"
        : "Turno cerrado (abre 19:00)"
      : null;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-32 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            {myRole === "staff" ? "Despacho de Pedidos" : "Gestión de Pedidos"}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {myRole === "staff" ? "Vista de turno actual (Fudo Mode)" : "Panel de administración global"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-wider text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> LIVE
          </span>
          <button
            onClick={() => syncFudo(true)}
            disabled={syncingFudo}
            className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${
              syncingFudo
                ? "bg-slate-50 text-slate-400 border-slate-200"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:shadow-sm"
            }`}
          >
            {syncingFudo ? "Sincronizando..." : "↻ Sincronizar Fudo"}
          </button>
        </div>
      </div>

      {myRole === "admin" && (
        <div className="bg-slate-900 text-white rounded-xl p-3 shadow-lg shadow-slate-200 flex flex-col xl:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2 bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setAdminMode("LIVE")}
              className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-colors ${
                adminMode === "LIVE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              TURNO ACTUAL
            </button>
            <button
              onClick={() => setAdminMode("ALL")}
              className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-colors ${
                adminMode === "ALL" ? "bg-indigo-500 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              VISIÓN GENERAL
            </button>
            <button
              onClick={() => setAdminMode("DATE")}
              className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-colors ${
                adminMode === "DATE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              POR FECHA
            </button>
            <button
              onClick={() => setAdminMode("ID")}
              className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-colors ${
                adminMode === "ID" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              BUSCAR ID
            </button>
          </div>

          <div className="flex-1 flex justify-end w-full md:w-auto">
            {adminMode === "LIVE" && <span className="text-xs text-slate-400 font-mono">{liveHint}</span>}
            {adminMode === "ALL" && <span className="text-xs text-indigo-300 font-mono font-bold">⚠️ Historial completo (Límite 200)</span>}
            {adminMode === "DATE" && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none"
              />
            )}
            {adminMode === "ID" && (
              <div className="flex gap-2 w-full md:w-auto">
                <input
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="# ID"
                  className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-1.5 w-full md:w-32 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && scheduleRefresh(0)}
                />
                <button
                  onClick={() => scheduleRefresh(0)}
                  className="bg-white text-slate-900 px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-200"
                >
                  BUSCAR
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {pedidos.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-400 font-medium">No se encontraron pedidos.</p>
            {myRole === "staff" && <p className="text-xs text-slate-300 mt-2">Turno cerrado. Esperando apertura...</p>}
          </div>
        ) : (
          pedidos.map((p) => {
            const motoNombre = p.delivery_nombre || p.repartidor_nombre || null;

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${estadoLeftBorder(
                  p.estado
                )}`}
              >
                <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs font-mono font-bold">#{p.id}</span>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{p.cliente_nombre || "Cliente Anónimo"}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wide rounded-full border ${estadoBadgeClass(p.estado)}`}>
                      {p.estado}
                    </span>
                    {myRole === "admin" && (
                      <button
                        onClick={() => borrarPedido(p.id)}
                        className="ml-2 text-slate-300 hover:text-red-600 transition-colors p-1"
                        title="Eliminar"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">📍</span>
                      <span className="font-medium text-slate-800">{p.direccion_entrega || "Retiro en local"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">🕒</span>
                      <span>{formatFechaArgentina(p.creado_en)}</span>
                    </div>

                    {p.cliente_phone_normalized && (
                      <div className="flex gap-2 mt-2">
                        <a
                          href={`tel:${p.cliente_phone_normalized}`}
                          className="text-xs bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 font-bold text-slate-700"
                        >
                          📞 Llamar
                        </a>
                        <a
                          href={crearLinkWhatsApp(p.cliente_phone_normalized)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-green-50 px-2 py-1 rounded hover:bg-green-100 font-bold text-green-700 border border-green-200"
                        >
                          💬 WhatsApp
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 md:items-end">
                    <div className="text-xl font-bold text-slate-800">${p.monto?.toLocaleString("es-AR")}</div>
                    {p.estado_source && (
                      <div className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                        Fudo Status: {p.estado_source}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-50 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50 -mx-5 -mb-5 p-4 mt-2">
                  <div className="flex items-center gap-2 bg-white border rounded-lg p-1 shadow-sm">
                    <div className="px-2">
                      <span className="text-xs text-slate-400 uppercase font-bold mr-1">MOTO:</span>
                      <span className={`text-sm font-bold ${motoNombre ? "text-slate-800" : "text-orange-500"}`}>
                        {motoNombre || "Sin Asignar"}
                      </span>
                    </div>
                    <select
                      id={`sel-rep-${p.id}`}
                      className="text-xs bg-slate-100 border-none rounded py-1 pl-2 pr-6 focus:ring-0 cursor-pointer"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) asignarDelivery(p.id, e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        Cambiar...
                      </option>
                      {repartidores.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.display_name || r.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase hidden md:inline">Estado:</span>
                    <select
                      value={p.estado ?? "pendiente"}
                      onChange={(e) => cambiarEstado(p.id, e.target.value)}
                      className="text-xs font-medium py-1.5 pl-3 pr-8 rounded-lg border-slate-200 bg-white shadow-sm focus:border-slate-800 focus:ring-0 cursor-pointer"
                    >
                      {ESTADOS.map((s) => (
                        <option key={s} value={s}>
                          {s.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
