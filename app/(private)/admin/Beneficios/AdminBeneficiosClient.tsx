"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Beneficio = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  category: string | null;
  image_url: string | null;
  points_cost: number;
  cash_extra: number;
  is_active: boolean;
  is_published: boolean;
  created_at: string;
};

export default function AdminBeneficiosClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "",
    summary: "",
    content: "",
    category: "",
    points_cost: 0,
    cash_extra: 0,
    is_published: false,
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("beneficios")
      .select("*")
      .order("created_at", { ascending: false });

    setRows(data || []);
    setLoading(false);
  }

  async function create() {
    if (!form.title || form.points_cost <= 0) {
      alert("Título y puntos obligatorios");
      return;
    }

    await supabase.from("beneficios").insert({
      ...form,
      is_active: true,
    });

    setForm({
      title: "",
      summary: "",
      content: "",
      category: "",
      points_cost: 0,
      cash_extra: 0,
      is_published: false,
    });

    load();
  }

  async function togglePublish(id: string, value: boolean) {
    await supabase
      .from("beneficios")
      .update({ is_published: value })
      .eq("id", id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar beneficio?")) return;
    await supabase.from("beneficios").delete().eq("id", id);
    load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-10">
      <section className="border rounded-xl p-6 bg-white shadow">
        <h2 className="text-xl font-bold mb-4">Nuevo beneficio</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            placeholder="Título"
            className="border rounded px-3 py-2"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            placeholder="Categoría"
            className="border rounded px-3 py-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            placeholder="Resumen"
            className="border rounded px-3 py-2 col-span-2"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <textarea
            placeholder="Detalle"
            className="border rounded px-3 py-2 col-span-2"
            rows={3}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <input
            type="number"
            placeholder="Puntos necesarios"
            className="border rounded px-3 py-2"
            value={form.points_cost}
            onChange={(e) =>
              setForm({ ...form, points_cost: Number(e.target.value) })
            }
          />
          <input
            type="number"
            placeholder="Dinero extra ($)"
            className="border rounded px-3 py-2"
            value={form.cash_extra}
            onChange={(e) =>
              setForm({ ...form, cash_extra: Number(e.target.value) })
            }
          />
        </div>

        <label className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            checked={form.is_published}
            onChange={(e) =>
              setForm({ ...form, is_published: e.target.checked })
            }
          />
          Publicado
        </label>

        <button
          onClick={create}
          className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded"
        >
          Crear beneficio
        </button>
      </section>

      <section className="border rounded-xl p-6 bg-white shadow">
        <h2 className="text-xl font-bold mb-4">Listado</h2>

        {loading ? (
          <p>Cargando…</p>
        ) : rows.length === 0 ? (
          <p>No hay beneficios</p>
        ) : (
          <div className="space-y-3">
            {rows.map((b) => (
              <div
                key={b.id}
                className="border rounded p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold">{b.title}</p>
                  <p className="text-sm text-slate-500">
                    {b.points_cost} pts{" "}
                    {b.cash_extra > 0 && `+ $${b.cash_extra}`}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => togglePublish(b.id, !b.is_published)}
                    className="text-sm px-3 py-1 border rounded"
                  >
                    {b.is_published ? "Ocultar" : "Publicar"}
                  </button>
                  <button
                    onClick={() => remove(b.id)}
                    className="text-sm px-3 py-1 border rounded text-red-600"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
