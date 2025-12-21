"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { updateOrderStatus } from "@/lib/updateOrderStatus";

// --- TIPOS ---
type Order = {
  id: number;
  cliente_nombre: string | null;
  direccion_entrega: string | null;
  monto: number | null;
  estado: string | null;
  creado_en: string;
  repartidor_nombre?: string | null; // fallback viejo
  delivery_nombre?: string | null;   // NUEVO (seguro para STAFF)
  estado_source?: string | null;
  source?: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

// Modos de filtro para ADMIN
type AdminFilterMode = "LIVE" | "DATE" | "ID" | "ALL";

const ESTADOS = [
  "pendiente",
  "en preparación",
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
];

// --- HELPERS UI ---
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

// --- FECHAS ---
const pad = (n: number) => String(n).padStart(2, "0");

const pgLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const getShiftStart = () => {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < 4) d.setDate(d.getDate() - 1);
  d.setHours(19, 0, 0, 0);
  return pgLocal(d);
};

const getDayRange = (dateString: string) => {
  const start = new Date(dateString);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateString);
  end.setHours(23, 59, 59, 999);
  return { start: pgLocal(start), end: pgLocal(end) };
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

  // --- ENRICH (se mantiene, NO rompe nada) ---
  const enrich = async (orders: any[]) => {
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);

    const { data: del } = await supabase
      .from("deliveries")
      .select("order_id, delivery_user_id")
      .in("order_id", ids);

    if (!del?.length) return orders.map((o) => ({ ...o, repartidor_nombre: null }));

    const uids = [...new Set(del.map((d: any) => d.delivery_user_id))].filter(Boolean);

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", uids as string[]);

    const map: Record<string, string> = {};
    prof?.forEach((p: any) => {
      map[p.id] = p.display_name || p.email?.split("@")[0] || "Repartidor";
    });

    const byOrder: Record<number, string> = {};
    del.forEach((d: any) => {
      if (d?.order_id && d?.delivery_user_id)
        byOrder[d.order_id] = map[d.delivery_user_id] || "Repartidor";
    });

    return orders.map((o) => ({ ...o, repartidor_nombre: byOrder[o.id] ?? null }));
  };

  // --- CARGAR PEDIDOS ---
  const cargarPedidos = async () => {
    if (!myRole) return;

    let q = supabase.from("orders").select("*").order("id", { ascending: false });

    if (myRole === "staff") {
      q = q.gte("creado_en", getShiftStart());
    } else {
      if (adminMode === "LIVE") q = q.gte("creado_en", getShiftStart());
      else if (adminMode === "DATE") {
        const { start, end } = getDayRange(selectedDate);
        q = q.gte("creado_en", start).lte("creado_en", end);
      } else if (adminMode === "ID") {
        const n = Number(searchId);
        if (!searchId || Number.isNaN(n)) return setPedidos([]);
        q = q.eq("id", n);
      } else if (adminMode === "ALL") q = q.limit(200);
    }

    const { data, error } = await q;
    if (error) return console.error(error.message);

    setPedidos((await enrich(data ?? [])) as Order[]);
  };

  // --- INIT ---
  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.session.user.id)
        .single();

      setMyRole(profile?.role === "staff" ? "staff" : "admin");

      const { data } = await supabase.from("profiles").select("*").eq("role", "delivery");
      setRepartidores(data ?? []);
      setLoading(false);
    })();
  }, []);

  // --- RENDER ---
  if (loading) return <div className="p-10 text-center">Cargando…</div>;

  return (
    <div className="p-6 space-y-4">
      {pedidos.map((p) => {
        const nombreDelivery =
          p.delivery_nombre || p.repartidor_nombre || "Sin Asignar";

        return (
          <div key={p.id} className={`border rounded p-4 ${estadoLeftBorder(p.estado)}`}>
            <div className="font-bold">#{p.id} – {p.cliente_nombre}</div>

            <div className="mt-2 text-sm">
              <b>MOTO:</b>{" "}
              <span className={nombreDelivery === "Sin Asignar" ? "text-orange-500" : ""}>
                {nombreDelivery}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
