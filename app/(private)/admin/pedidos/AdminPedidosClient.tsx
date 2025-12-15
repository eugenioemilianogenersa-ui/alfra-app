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

// ---------- helpers UI ----------
const estadoBadgeClass = (e?: string | null) =>
  ({
    pendiente: "bg-slate-200 text-slate-800 border-slate-300",
    "en preparación": "bg-orange-100 text-orange-800 border-orange-200",
    "listo para entregar": "bg-blue-100 text-blue-800 border-blue-200",
    enviado: "bg-yellow-100 text-yellow-900 border-yellow-300",
    entregado: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelado: "bg-red-100 text-red-800 border-red-300",
  } as any)[e ?? ""] ?? "bg-slate-200 text-slate-800 border-slate-300";

const estadoSelectClass = (e?: string | null) =>
  ({
    pendiente: "bg-slate-100 text-slate-900 border-slate-300",
    "en preparación": "bg-orange-100 text-orange-900 border-orange-300",
    "listo para entregar": "bg-blue-100 text-blue-900 border-blue-300",
    enviado: "bg-yellow-100 text-yellow-900 border-yellow-300",
    entregado: "bg-emerald-100 text-emerald-900 border-emerald-300",
    cancelado: "bg-red-100 text-red-900 border-red-400",
  } as any)[e ?? ""] ?? "bg-slate-100 text-slate-900 border-slate-300";

const estadoLeftBorder = (e?: string | null) =>
  ({
    pendiente: "border-l-slate-400",
    "en preparación": "border-l-orange-500",
    "listo para entregar": "border-l-blue-500",
    enviado: "border-l-yellow-500",
    entregado: "border-l-emerald-600",
    cancelado: "border-l-red-600",
  } as any)[e ?? ""] ?? "border-l-slate-400";

// ---------- fechas (timestamp without time zone) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const pgLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const getShiftStart = () => {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < 2) d.setDate(d.getDate() - 1);
  d.setHours(19, 0, 0, 0);
  return pgLocal(d);
};

const get48h = () => {
  const d = new Date();
  d.setHours(d.getHours() - 48);
  return pgLocal(d);
};

export default function AdminPedidosClient() {
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFudo, setSyncingFudo] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("SHIFT");
  const [searchId, setSearchId] = useState("");

  const isSyncingRef = useRef(false);
  const last429Ref = useRef<number | null>(null);

  const enrich = async (orders: any[]) => {
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);

    const { data: del } = await supabase
      .from("deliveries")
      .select("order_id, delivery_user_id")
      .in("order_id", ids);

    if (!del?.length) return orders;

    const uids = [...new Set(del.map((d: any) => d.delivery_user_id))];
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", uids);

    const map: Record<string, string> = {};
    prof?.forEach(
      (p: any) =>
        (map[p.id] =
          p.display_name || p.email?.split("@")[0] || "Repartidor")
    );

    const byOrder: Record<number, string> = {};
    del.forEach((d: any) => (byOrder[d.order_id] = map[d.delivery_user_id]));

    return orders.map((o) => ({
      ...o,
      repartidor_nombre: byOrder[o.id] ?? null,
    }));
  };

  const cargarPedidos = async () => {
    let q = supabase.from("orders").select("*").order("id", { ascending: false });

    if (viewMode === "SHIFT") q = q.gte("creado_en", getShiftStart());
    if (viewMode === "48H") q = q.gte("creado_en", get48h());
    if (viewMode === "ID") {
      const n = Number(searchId);
      if (!searchId || Number.isNaN(n)) return setPedidos([]);
      q = q.eq("id", n);
    }

    const { data, error } = await q;
    if (error) return console.error(error.message);

    setPedidos(await enrich(data ?? []));
  };

  const syncFudo = async (forced?: boolean) => {
    const now = Date.now();
    if (isSyncingRef.current) return;
    if (!forced && last429Ref.current && now - last429Ref.current < 60000)
      return;

    try {
      isSyncingRef.current = true;
      setSyncingFudo(true);
      const r = await fetch("/api/fudo/sync");
      if (!r.ok && r.status === 429) last429Ref.current = now;
      await cargarPedidos();
    } finally {
      isSyncingRef.current = false;
      setSyncingFudo(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "delivery");
      setRepartidores(data ?? []);
      await cargarPedidos();
      setLoading(false);
      await syncFudo(true);
    })();

    const ch = supabase
      .channel("admin-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        cargarPedidos
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        cargarPedidos
      )
      .subscribe();

    const i = setInterval(() => {
      if (document.visibilityState === "visible") syncFudo();
    }, 25000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(i);
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!loading) cargarPedidos();
    // eslint-disable-next-line
  }, [viewMode]);

  const asignarDelivery = async (orderId: number, deliveryUserId: string) => {
    if (!deliveryUserId) return alert("Seleccioná un repartidor");
    await fetch("/api/delivery/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, deliveryUserId }),
    });
    await cargarPedidos();
  };

  const cambiarEstado = async (id: number, estado: string) => {
    setPedidos((p) => p.map((o) => (o.id === id ? { ...o, estado } : o)));
    await supabase
      .from("orders")
      .update({ estado, estado_source: "APP_ADMIN" })
      .eq("id", id);
  };

  if (loading)
    return <div className="p-6 text-center">Conectando con la base…</div>;

  return (
    <div className="p-6 space-y-6 pb-32 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <h1 className="text-2xl font-bold">Gestión de Pedidos</h1>
          <button
            onClick={() => syncFudo(true)}
            className="text-xs px-3 py-1 rounded-full border bg-white"
          >
            {syncingFudo ? "Sincronizando…" : "↻ Sync Fudo"}
          </button>
        </div>
        <span className="text-xs font-mono flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          LIVE SYNC
        </span>
      </div>

      {/* ---------- VISTAS ---------- */}
      <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          <span className="text-xs font-bold uppercase text-slate-500">
            Vista:
          </span>

          <button
            onClick={() => setViewMode("SHIFT")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "SHIFT"
                ? "bg-slate-900 text-white"
                : "bg-white"
            }`}
          >
            Turno actual (19hs a 2hs)
          </button>

          <button
            onClick={() => setViewMode("48H")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "48H"
                ? "bg-slate-900 text-white"
                : "bg-white"
            }`}
          >
            Últimas 48h
          </button>

          <button
            onClick={() => setViewMode("ID")}
            className={`text-xs px-3 py-1 rounded-full border ${
              viewMode === "ID"
                ? "bg-slate-900 text-white"
                : "bg-white"
            }`}
          >
            Buscar por ID
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="ID pedido"
            className="border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => cargarPedidos()}
            className="bg-slate-900 text-white px-4 rounded text-sm"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* ---------- LISTA ---------- */}
      <div className="space-y-4">
        {pedidos.map((p) => (
          <div
            key={p.id}
            className={`bg-white border rounded-xl p-4 border-l-4 ${estadoLeftBorder(
              p.estado
            )}`}
          >
            <div className="flex gap-2 items-center">
              <span className="bg-slate-800 text-white px-2 rounded text-xs">
                #{p.id}
              </span>
              <strong>{p.cliente_nombre}</strong>
              <span
                className={`ml-auto px-3 py-0.5 text-xs rounded-full border ${estadoBadgeClass(
                  p.estado
                )}`}
              >
                {p.estado}
              </span>
            </div>

            <div className="text-sm text-slate-600 mt-1">
              📍 {p.direccion_entrega} · 💰 ${p.monto}
            </div>

            <div className="flex gap-3 mt-3 justify-end">
              <select
                value={p.estado ?? "pendiente"}
                onChange={(e) => cambiarEstado(p.id, e.target.value)}
                className={`text-xs p-2 rounded border ${estadoSelectClass(
                  p.estado
                )}`}
              >
                {ESTADOS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>

              <div className="flex gap-1">
                <select
                  id={`sel-${p.id}`}
                  className="text-xs border rounded px-2"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Repartidor…
                  </option>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.display_name || r.email}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const s = document.getElementById(
                      `sel-${p.id}`
                    ) as HTMLSelectElement;
                    asignarDelivery(p.id, s.value);
                  }}
                  className="bg-slate-800 text-white px-3 rounded text-xs"
                >
                  ASIGNAR
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
