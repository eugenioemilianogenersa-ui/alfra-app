"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Order = {
  id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  estado: string | null;
  creado_en: string;
  source?: string | null;
  repartidor_nombre?: string | null;
  estado_source?: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

type ViewMode = "SHIFT" | "48H" | "ID";

const ESTADOS = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
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
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-slate-200 text-slate-800 border-slate-300";
  }
}

function estadoSelectClass(estado?: string | null) {
  switch (estado) {
    case "pendiente":
      return "bg-slate-100 text-slate-900 border-slate-300";
    case "en preparación":
      return "bg-orange-100 text-orange-900 border-orange-300";
    case "listo para entregar":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "enviado":
      return "bg-yellow-100 text-yellow-900 border-yellow-300";
    case "entregado":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "cancelado":
      return "bg-red-100 text-red-900 border-red-400";
    default:
      return "bg-slate-100 text-slate-900 border-slate-300";
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

// ✅ Formato compatible con "timestamp without time zone" (sin Z)
function formatPgLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

/**
 * ✅ Día operativo ALFRA (local):
 * - abre 19:00
 * - cierra 02:00
 * Si hora < 02:00 → arrancó AYER 19:00
 * Si hora >= 02:00 → arrancó HOY 19:00
 */
function getAlfraShiftStartPgLocal(): string {
  const now = new Date();
  const hourLocal = now.getHours();
  const start = new Date(now);

  if (hourLocal < 2) start.setDate(start.getDate() - 1);
  start.setHours(19, 0, 0, 0);

  return formatPgLocal(start);
}

function getLast48hPgLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() - 48);
  return formatPgLocal(d);
}

export default function AdminPedidosClient() {
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFudo, setSyncingFudo] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("SHIFT");
  const [searchId, setSearchId] = useState<string>("");

  const isSyncingRef = useRef(false);
  const last429Ref = useRef<number | null>(null);

  const enrichWithDeliveryNames = async (ordersData: any[]) => {
    if (!ordersData || ordersData.length === 0) return [];

    const orderIds = ordersData.map((o: any) => o.id);

    const { data: deliveriesData, error: deliveriesError } = await supabase
      .from("deliveries")
      .select("order_id, delivery_user_id")
      .in("order_id", orderIds);

    if (deliveriesError) {
      console.error("Error cargando deliveries:", deliveriesError.message);
    }

    let repartidorPorOrderId: Record<number, string | null> = {};

    if (deliveriesData && deliveriesData.length > 0) {
      const userIds = Array.from(new Set(deliveriesData.map((d: any) => d.delivery_user_id)));

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profilesError) {
        console.error("Error cargando perfiles repartidores:", profilesError.message);
      }

      const nombrePorUserId: Record<string, string> = {};
      profilesData?.forEach((p: any) => {
        nombrePorUserId[p.id] =
          p.display_name || (p.email ? p.email.split("@")[0] : "Repartidor");
      });

      deliveriesData.forEach((d: any) => {
        repartidorPorOrderId[d.order_id] = nombrePorUserId[d.delivery_user_id] || null;
      });
    }

    return ordersData.map((o: any) => ({
      ...o,
      repartidor_nombre: repartidorPorOrderId[o.id] ?? null,
    })) as Order[];
  };

  const cargarPedidos = async () => {
    try {
      let query = supabase.from("orders").select("*").order("id", { ascending: false });

      if (viewMode === "SHIFT") {
        query = query.gte("creado_en", getAlfraShiftStartPgLocal());
      } else if (viewMode === "48H") {
        query = query.gte("creado_en", getLast48hPgLocal());
      } else if (viewMode === "ID") {
        const idNum = Number(searchId);
        if (!searchId || Number.isNaN(idNum)) {
          setPedidos([]);
          return;
        }
        query = query.eq("id", idNum);
      }

      const { data: ordersData, error: ordersError } = await query;

      if (ordersError) {
        console.error("Error cargando pedidos:", ordersError.message);
        return;
      }

      const enriched = await enrichWithDeliveryNames((ordersData as any[]) ?? []);
      setPedidos(enriched);
    } catch (e: any) {
      console.error("Error cargarPedidos:", e?.message || e);
    }
  };

  const syncFudo = async (opts?: { forced?: boolean }) => {
    const now = Date.now();
    if (isSyncingRef.current) return;

    if (!opts?.forced && last429Ref.current && now - last429Ref.current < 60_000) {
      console.warn("[FUDO SYNC] Pausado temporalmente por 429 reciente");
      return;
    }

    try {
      isSyncingRef.current = true;
      setSyncingFudo(true);

      const res = await fetch("/api/fudo/sync");

      if (!res.ok) {
        console.error("[FUDO SYNC] Error HTTP:", res.status);
        if (res.status === 429) {
          last429Ref.current = now;
          console.error("[FUDO SYNC] 429 → pausamos auto-sync 60s");
        }
      } else {
        last429Ref.current = null;
      }

      await cargarPedidos();
    } catch (e: any) {
      console.error("[FUDO SYNC] Error general:", e?.message || e);
    } finally {
      isSyncingRef.current = false;
      setSyncingFudo(false);
    }
  };

  useEffect(() => {
    const cargarRepartidores = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "delivery");

      if (error) {
        console.error("Error cargando repartidores:", error.message);
        return;
      }

      setRepartidores((data as Profile[]) ?? []);
    };

    const init = async () => {
      await Promise.all([cargarRepartidores(), cargarPedidos()]);
      setLoading(false);
      await syncFudo({ forced: true });
    };

    init();

    const channel = supabase
      .channel("admin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async () => {
        await cargarPedidos();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, async () => {
        await cargarPedidos();
      })
      .subscribe();

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") syncFudo();
    }, 25_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) cargarPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const asignarDelivery = async (orderId: number, deliveryUserId: string) => {
    if (!deliveryUserId) {
      alert("Seleccioná un repartidor primero.");
      return;
    }

    try {
      const res = await fetch("/api/delivery/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, deliveryUserId }),
      });

      const data = await res.json();

      if (!data.ok) {
        alert("Error al asignar: " + (data.error || "desconocido"));
        return;
      }

      await cargarPedidos();
    } catch (err: any) {
      console.error("Error asignarDelivery:", err);
      alert("Error inesperado al asignar repartidor.");
    }
  };

  const cambiarEstado = async (id: number, nuevoEstado: string) => {
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estado: nuevoEstado } : p))
    );

    await supabase
      .from("orders")
      .update({
        estado: nuevoEstado,
        estado_source: "APP_ADMIN",
      })
      .eq("id", id);
  };

  const onBuscar = async () => {
    setViewMode("ID");
    await cargarPedidos();
  };

  if (loading) return <div className="p-6 text-center">Conectando con la base...</div>;

  return (
    <div className="p-6 space-y-6 pb-32 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Pedidos</h1>
          <button
            onClick={() => syncFudo({ forced: true })}
            className="text-xs px-3 py-1 rounded-full border bg-white hover:bg-amber-50 flex items-center gap-2"
            disabled={syncingFudo}
          >
            {syncingFudo ? "Sincronizando..." : "↻ Sync Fudo"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-xs text-slate-500 font-mono">LIVE SYNC</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-3 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-slate-500 uppercase">Vista:</span>

          <button
            onClick={() => setViewMode("SHIFT")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "SHIFT"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            Turno actual (19–02)
          </button>

          <button
            onClick={() => setViewMode("48H")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "48H"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            Últimas 48h
          </button>

          <button
            onClick={() => setViewMode("ID")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "ID"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            Buscar por ID
          </button>
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="ID pedido (ej: 45536)"
            className="border rounded px-3 py-2 text-sm w-full md:w-56"
          />
          <button
            onClick={onBuscar}
            className="bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded hover:bg-black"
          >
            Buscar
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {pedidos.map((p) => {
          const tieneRepartidor = !!p.repartidor_nombre;

          return (
            <div
              key={p.id}
              className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4 transition-all duration-300 border-l-4 ${estadoLeftBorder(
                p.estado
              )} ${p.estado === "entregado" ? "opacity-80 bg-slate-50" : ""}`}
            >
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs font-mono">
                    #{p.id}
                  </span>
                  <span className="font-bold text-slate-800">{p.cliente_nombre}</span>

                  <span
                    className={`ml-auto inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold border ${estadoBadgeClass(
                      p.estado
                    )}`}
                    title={p.estado_source ?? ""}
                  >
                    {p.estado ?? "pendiente"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:gap-4 text-sm text-slate-600">
                  <p>📍 {p.direccion_entrega}</p>

                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <p className="font-semibold text-emerald-600">💰 ${p.monto}</p>

                    <span
                      className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold border
                        ${
                          tieneRepartidor
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                    >
                      🛵 Repartidor: {p.repartidor_nombre || "Sin asignar"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
                <select
                  value={p.estado || "pendiente"}
                  onChange={(e) => cambiarEstado(p.id, e.target.value)}
                  className={`p-2 rounded text-xs font-bold border cursor-pointer uppercase tracking-wide ${estadoSelectClass(
                    p.estado
                  )}`}
                >
                  {ESTADOS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded border">
                  <select
                    id={`sel-${p.id}`}
                    className="bg-transparent text-xs outline-none w-32 py-1"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      🛵 Repartidor...
                    </option>
                    {repartidores.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name || r.email?.split("@")[0]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const select = document.getElementById(`sel-${p.id}`) as HTMLSelectElement;
                      asignarDelivery(p.id, select.value);
                    }}
                    className="bg-slate-800 text-white text-[10px] uppercase font-bold px-3 py-1.5 rounded hover:bg-black transition"
                  >
                    ASIGNAR
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
