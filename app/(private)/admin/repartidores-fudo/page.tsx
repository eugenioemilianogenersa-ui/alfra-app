"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};

type FudoWaiterMap = {
  waiter_id_fudo: string;
  delivery_user_id: string;
};

export default function RepartidoresFudoPage() {
  const supabase = createClient();

  const [repartidores, setRepartidores] = useState<Profile[]>([]);
  const [mapeos, setMapeos] = useState<FudoWaiterMap[]>([]);
  const [loading, setLoading] = useState(true);

  // Form nuevo mapeo
  const [nuevoWaiterId, setNuevoWaiterId] = useState("");
  const [nuevoDeliveryId, setNuevoDeliveryId] = useState("");

  useEffect(() => {
    const cargarTodo = async () => {
      await Promise.all([cargarRepartidores(), cargarMapeos()]);
      setLoading(false);
    };
    cargarTodo();
  }, []);

  const cargarRepartidores = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role")
      .eq("role", "delivery");

    if (error) {
      console.error("Error cargando repartidores:", error.message);
      return;
    }

    setRepartidores((data || []) as Profile[]);
  };

  const cargarMapeos = async () => {
    const { data, error } = await supabase
      .from("fudo_waiter_map")
      .select("waiter_id_fudo, delivery_user_id");

    if (error) {
      console.error("Error cargando fudo_waiter_map:", error.message);
      return;
    }

    setMapeos((data || []) as FudoWaiterMap[]);
  };

  const handleCrearMapeo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevoWaiterId.trim() || !nuevoDeliveryId) {
      alert("Completá el ID de Fudo y el repartidor.");
      return;
    }

    // Primero actualizamos si ya existe ese waiter_id_fudo
    const { error: updateError } = await supabase
      .from("fudo_waiter_map")
      .update({ delivery_user_id: nuevoDeliveryId })
      .eq("waiter_id_fudo", nuevoWaiterId.trim());

    if (updateError) {
      console.error("Error actualizando mapeo:", updateError.message);
    }

    // Si no existía, insert simple (si ya existía, igualmente ilustra el flujo)
    const { error: insertError } = await supabase.from("fudo_waiter_map").insert({
      waiter_id_fudo: nuevoWaiterId.trim(),
      delivery_user_id: nuevoDeliveryId,
    });

    if (insertError && !insertError.message.includes("duplicate")) {
      console.error("Error insertando mapeo:", insertError.message);
      alert("Error guardando mapeo.");
      return;
    }

    setNuevoWaiterId("");
    setNuevoDeliveryId("");
    await cargarMapeos();
  };

  const handleCambiarDelivery = async (
    waiterIdFudo: string,
    nuevoDeliveryId: string
  ) => {
    if (!nuevoDeliveryId) return;

    const { error } = await supabase
      .from("fudo_waiter_map")
      .update({ delivery_user_id: nuevoDeliveryId })
      .eq("waiter_id_fudo", waiterIdFudo);

    if (error) {
      console.error("Error actualizando mapeo:", error.message);
      alert("No se pudo actualizar el mapeo.");
      return;
    }

    setMapeos((prev) =>
      prev.map((m) =>
        m.waiter_id_fudo === waiterIdFudo
          ? { ...m, delivery_user_id: nuevoDeliveryId }
          : m
      )
    );
  };

  const handleEliminarMapeo = async (waiterIdFudo: string) => {
    const ok = window.confirm(
      `¿Eliminar mapeo para waiter Fudo "${waiterIdFudo}"?`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("fudo_waiter_map")
      .delete()
      .eq("waiter_id_fudo", waiterIdFudo);

    if (error) {
      console.error("Error eliminando mapeo:", error.message);
      alert("No se pudo eliminar.");
      return;
    }

    setMapeos((prev) =>
      prev.filter((m) => m.waiter_id_fudo !== waiterIdFudo)
    );
  };

  const getDeliveryLabel = (id: string) => {
    const r = repartidores.find((x) => x.id === id);
    if (!r) return "??";
    return r.display_name || r.email || r.id;
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Cargando...</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">
          Mapeo Repartidores Fudo ↔ Alfra
        </h1>
        <span className="text-xs text-slate-500">
          Tabla: <code>fudo_waiter_map</code>
        </span>
      </div>

      {/* NUEVO MAPEO */}
      <div className="bg-slate-50 border rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-600 uppercase">
          Nuevo mapeo
        </h2>
        <form
          onSubmit={handleCrearMapeo}
          className="flex flex-col md:flex-row gap-3 items-stretch md:items-end"
        >
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              ID de mozo / repartidor en Fudo
            </label>
            <input
              type="text"
              value={nuevoWaiterId}
              onChange={(e) => setNuevoWaiterId(e.target.value)}
              placeholder="Ej: 123 o uuid que ves en la URL de Fudo"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Repartidor Alfra
            </label>
            <select
              value={nuevoDeliveryId}
              onChange={(e) => setNuevoDeliveryId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">-- Elegí un repartidor --</option>
              {repartidores.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name || r.email || r.id}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="md:w-40 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2 rounded-lg shadow"
          >
            Guardar
          </button>
        </form>
      </div>

      {/* LISTA DE MAPEOS */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-600 uppercase">
            Mapeos actuales
          </h2>
          <span className="text-xs text-slate-400">
            {mapeos.length} mapeo(s)
          </span>
        </div>

        {mapeos.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">
            No hay mapeos todavía. Creá el primero arriba.
          </div>
        )}

        {mapeos.length > 0 && (
          <div className="divide-y">
            {mapeos.map((m) => (
              <div
                key={m.waiter_id_fudo}
                className="px-4 py-3 flex flex-col md:flex-row gap-3 md:items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500">
                    Waiter Fudo
                  </p>
                  <p className="font-mono text-sm bg-slate-50 px-2 py-1 rounded border">
                    {m.waiter_id_fudo}
                  </p>
                </div>

                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500 mb-1">
                    Repartidor Alfra
                  </p>
                  <select
                    value={m.delivery_user_id}
                    onChange={(e) =>
                      handleCambiarDelivery(m.waiter_id_fudo, e.target.value)
                    }
                    className="w-full border rounded px-3 py-2 text-sm bg-white"
                  >
                    {repartidores.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name || r.email || r.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Actualmente: {getDeliveryLabel(m.delivery_user_id)}
                  </p>
                </div>

                <button
                  onClick={() => handleEliminarMapeo(m.waiter_id_fudo)}
                  className="md:w-28 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold px-3 py-2 rounded"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
