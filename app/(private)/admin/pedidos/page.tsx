"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

// Tipos
type Order = {
  id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  estado: string | null;
  creado_en: string;
  source?: string | null;
  repartidor_nombre?: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

const ESTADOS = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
];

export default function PedidosAdmin() {
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFudo, setSyncingFudo] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualMonto, setManualMonto] = useState("");

  // refs para control de sync y backoff por 429
  const isSyncingRef = useRef(false);
  const last429Ref = useRef<number | null>(null);

  const getTodayStartIso = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}T00:00:00Z`;
  };

  const syncFudo = async (opts?: { forced?: boolean }) => {
    const now = Date.now();

    // si ya hay un sync corriendo, no lanzar otro
    if (isSyncingRef.current) return;

    // si hace menos de 60s tuvimos un 429, frenamos el auto-sync
    if (
      !opts?.forced &&
      last429Ref.current &&
      now - last429Ref.current < 60_000
    ) {
      console.warn("[FUDO SYNC] Pausado temporalmente por 429 reciente");
      return;
    }

    try {
      isSyncingRef.current = true;
      setSyncingFudo(true);

      console.log("🔄 Iniciando Sync Fudo -> Supabase...");
      const res = await fetch("/api/fudo/sync");

      if (!res.ok) {
        console.error("[FUDO SYNC] Error HTTP en /api/fudo/sync:", res.status);
        if (res.status === 429) {
          last429Ref.current = now;
          console.error(
            "[FUDO SYNC] Recibido 429, pausamos auto-sync por 60s"
          );
        }
      } else {
        // si salió bien, reseteamos el backoff
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
    const init = async () => {
      await Promise.all([cargarUsuarios(), cargarPedidos()]);
      setLoading(false);
      // primer sync forzado manual (ignora backoff)
      await syncFudo({ forced: true });
    };
    init();

    const supabaseChannel = supabase
      .channel("admin-dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const nuevo = payload.new as Order;
            const todayStartIso = getTodayStartIso();
            if (nuevo.creado_en >= todayStartIso) {
              setPedidos((prev) => [nuevo, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            setPedidos((prev) =>
              prev.map((p) =>
                p.id === (payload.new as any).id
                  ? { ...p, ...(payload.new as any) }
                  : p
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => {
          cargarPedidos();
        }
      )
      .subscribe();

    // ⏱️ Sync Fudo cada 15 segundos (antes 5s)
    const intervalId = setInterval(() => {
      syncFudo();
    }, 15_000);

    return () => {
      supabase.removeChannel(supabaseChannel);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarPedidos = async () => {
    const todayStartIso = getTodayStartIso();

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .gte("creado_en", todayStartIso)
      .order("id", { ascending: false });

    if (ordersError) {
      console.error("Error cargando pedidos:", ordersError.message);
      return;
    }

    if (!ordersData || ordersData.length === 0) {
      setPedidos([]);
      return;
    }

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
      const userIds = Array.from(
        new Set(deliveriesData.map((d: any) => d.delivery_user_id))
      );

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profilesError) {
        console.error(
          "Error cargando perfiles repartidores:",
          profilesError.message
        );
      }

      const nombrePorUserId: Record<string, string> = {};
      profilesData?.forEach((p: any) => {
        nombrePorUserId[p.id] =
          p.display_name || (p.email ? p.email.split("@")[0] : "Repartidor");
      });

      deliveriesData.forEach((d: any) => {
        const nombre = nombrePorUserId[d.delivery_user_id] || null;
        if (nombre) {
          repartidorPorOrderId[d.order_id] = nombre;
        }
      });
    }

    const enriched = (ordersData as any[]).map((o) => ({
      ...o,
      repartidor_nombre: repartidorPorOrderId[o.id] ?? null,
    }));

    setPedidos(enriched as Order[]);
  };

  const cargarUsuarios = async () => {
    const { data, error } = await supabase.from("profiles").select("*");
    if (error) {
      console.error("Error cargando profiles:", error.message);
      return;
    }
    if (data) {
      const allProfiles = data as Profile[];
      setRepartidores(allProfiles.filter((p) => p.role === "delivery"));
      setClientes(allProfiles.filter((p) => p.role !== "delivery"));
    }
  };

  const handleCrearPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    let userIdToSave = null;
    let nameToSave = manualName;

    if (selectedClientId) {
      const clienteObj = clientes.find((c) => c.id === selectedClientId);
      if (clienteObj) {
        userIdToSave = clienteObj.id;
        if (!nameToSave)
          nameToSave =
            clienteObj.display_name || clienteObj.email || "Cliente App";
      }
    }

    const { error } = await supabase.from("orders").insert({
      cliente_nombre: nameToSave,
      direccion_entrega: manualAddress,
      monto: Number(manualMonto),
      user_id: userIdToSave,
      estado: "pendiente",
      source: userIdToSave ? "APP" : "MANUAL",
    });

    if (error) alert("Error: " + error.message);
    else {
      setManualName("");
      setManualAddress("");
      setManualMonto("");
      setSelectedClientId("");
      await cargarPedidos();
    }
  };

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
    await supabase.from("orders").update({ estado: nuevoEstado }).eq("id", id);
  };

  if (loading)
    return <div className="p-6 text-center">Conectando con la base...</div>;

  return (
    <div className="p-6 space-y-8 pb-32 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">
            Gestión de Pedidos
          </h1>
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

      {/* Formulario */}
      <div className="bg-slate-50 p-5 rounded-xl border shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-3">
          Nuevo Pedido Manual
        </h2>
        <form
          onSubmit={handleCrearPedido}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3"
        >
          <div className="lg:col-span-1">
            <select
              className="w-full p-2 border rounded text-sm bg-white"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">-- Cliente Casual --</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  👤 {c.email || c.display_name}
                </option>
              ))}
            </select>
          </div>
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Nombre"
            required={!selectedClientId}
            className="p-2 border rounded text-sm"
          />
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder="Dirección"
            required
            className="p-2 border rounded text-sm"
          />
          <input
            value={manualMonto}
            onChange={(e) => setManualMonto(e.target.value)}
            type="number"
            placeholder="$ Monto"
            required
            className="p-2 border rounded text-sm"
          />
          <button
            type="submit"
            className="bg-amber-600 text-white font-bold rounded hover:bg-amber-700 transition shadow-md"
          >
            + CREAR
          </button>
        </form>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {pedidos.map((p) => {
          const tieneRepartidor = !!p.repartidor_nombre;

          return (
            <div
              key={p.id}
              className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4 transition-all duration-500
            ${p.estado === "enviado" ? "border-l-4 border-l-blue-500" : ""}
            ${p.estado === "entregado" ? "opacity-70 bg-slate-50" : ""}
          `}
            >
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs font-mono">
                    #{p.id}
                  </span>
                  <span className="font-bold text-slate-800">
                    {p.cliente_nombre}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:gap-4 text-sm text-slate-600">
                  <p>📍 {p.direccion_entrega}</p>

                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <p className="font-semibold text-emerald-600">
                      💰 ${p.monto}
                    </p>

                    <span
                      className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold
                      ${
                        tieneRepartidor
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "bg-slate-200 text-slate-600 border border-slate-300"
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
                  className={`p-2 rounded text-xs font-bold border cursor-pointer uppercase tracking-wide
                        ${
                          p.estado === "enviado"
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : p.estado === "entregado"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : p.estado === "cancelado"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : p.estado === "listo para entregar"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                        }`}
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
                      const select = document.getElementById(
                        `sel-${p.id}`
                      ) as HTMLSelectElement;
                      asignarDelivery(p.id, select.value);
                    }}
                    className="bg-slate-800 text-white text-[10px] uppercase font-bold px-3 py-1.5 rounded hover:bg-black transition"
                  >
                    Asignar
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
