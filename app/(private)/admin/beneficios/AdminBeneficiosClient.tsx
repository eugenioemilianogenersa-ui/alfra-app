"use client";

import { useEffect, useState, ChangeEvent, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name?: string | null;
  role: string | null;
};

type BeneficioRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;

  points_cost: number;
  cash_extra: number;
  is_active: boolean;

  is_published: boolean;
  published_at: string | null;
};

export default function AdminBeneficiosClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);

  const [rows, setRows] = useState<BeneficioRow[]>([]);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");

  const [pointsCost, setPointsCost] = useState<number>(0);
  const [cashExtra, setCashExtra] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const [isPublished, setIsPublished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("Ningún archivo seleccionado");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setErrorMsg("Error al obtener usuario: " + userError.message);
        setLoading(false);
        return;
      }
      if (!userData?.user) {
        setErrorMsg("No hay usuario logueado.");
        setLoading(false);
        return;
      }

      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profError) {
        setErrorMsg(`Error al leer profiles: ${profError.code} - ${profError.message}`);
        setLoading(false);
        return;
      }
      if (!prof) {
        setErrorMsg("No se encontró perfil para id = " + userData.user.id);
        setLoading(false);
        return;
      }
      if (prof.role !== "admin") {
        setErrorMsg("No tenés permisos de administrador.");
        setLoading(false);
        return;
      }

      setAdminProfile(prof as Profile);

      const { data, error } = await supabase
        .from("beneficios")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(`Error al cargar beneficios: ${error.code} - ${error.message}`);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as BeneficioRow[]);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSummary("");
    setContent("");
    setImageUrl("");
    setCategory("");
    setPointsCost(0);
    setCashExtra(0);
    setIsActive(true);
    setIsPublished(false);
    setFormMessage(null);
    setImageUploadMessage(null);
    setSelectedFileName("Ningún archivo seleccionado");
  }

  function startEdit(n: BeneficioRow) {
    setEditingId(n.id);
    setTitle(n.title);
    setSummary(n.summary ?? "");
    setContent(n.content ?? "");
    setImageUrl(n.image_url ?? "");
    setCategory(n.category ?? "");
    setPointsCost(Number(n.points_cost ?? 0));
    setCashExtra(Number(n.cash_extra ?? 0));
    setIsActive(Boolean(n.is_active));
    setIsPublished(Boolean(n.is_published));
    setFormMessage(null);
    setImageUploadMessage(null);
    setSelectedFileName(n.image_url ? "Imagen ya cargada" : "Ningún archivo seleccionado");
  }

  async function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploading(true);
    setImageUploadMessage(null);
    setSelectedFileName(file.name);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("beneficios-images")
        .upload(fileName, file);

      if (error) {
        setImageUploadMessage(`Error al subir imagen: ${error.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("beneficios-images")
        .getPublicUrl(data.path);

      setImageUrl(publicData.publicUrl);
      setImageUploadMessage("Imagen subida correctamente.");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setFormMessage("El título es obligatorio.");
      return;
    }
    if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
      setFormMessage("El costo en puntos debe ser mayor a 0.");
      return;
    }
    if (!Number.isFinite(cashExtra) || cashExtra < 0) {
      setFormMessage("El extra en dinero no puede ser negativo.");
      return;
    }

    setSaving(true);
    setFormMessage(null);

    try {
      const nowIso = new Date().toISOString();
      const published_at_value = isPublished ? nowIso : null;

      const payload = {
        title: title.trim(),
        summary: summary.trim() || null,
        content: content.trim() || null,
        image_url: imageUrl || null,
        category: category.trim() || null,

        points_cost: Math.floor(pointsCost),
        cash_extra: Math.floor(cashExtra),
        is_active: isActive,

        is_published: isPublished,
        published_at: published_at_value,
      };

      if (!editingId) {
        const { data: inserted, error } = await supabase
          .from("beneficios")
          .insert(payload)
          .select()
          .single();

        if (error) {
          setFormMessage(`Error al crear beneficio: ${error.code} - ${error.message}`);
          return;
        }

        if (inserted) {
          setRows((prev) => [inserted as BeneficioRow, ...prev]);
          resetForm();
          setFormMessage("Beneficio creado correctamente.");
        }
      } else {
        const { data: updated, error } = await supabase
          .from("beneficios")
          .update({
            ...payload,
            published_at: isPublished ? published_at_value : null,
          })
          .eq("id", editingId)
          .select()
          .single();

        if (error) {
          setFormMessage(`Error al actualizar beneficio: ${error.code} - ${error.message}`);
          return;
        }

        if (updated) {
          setRows((prev) =>
            prev.map((n) => (n.id === editingId ? (updated as BeneficioRow) : n))
          );
          setFormMessage("Beneficio actualizado correctamente.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(n: BeneficioRow) {
    const ok = window.confirm(`¿Eliminar "${n.title}"? Esta acción es permanente.`);
    if (!ok) return;

    const { error } = await supabase.from("beneficios").delete().eq("id", n.id);
    if (error) {
      alert(`Error al eliminar: ${error.code} - ${error.message}`);
      return;
    }

    setRows((prev) => prev.filter((x) => x.id !== n.id));
    if (editingId === n.id) resetForm();
  }

  return (
    <main className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Beneficios</h1>

      {loading && <p className="text-sm text-slate-500">Cargando panel...</p>}

      {!loading && errorMsg && (
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">
          <p className="font-semibold mb-1">Error:</p>
          <p>{errorMsg}</p>
        </div>
      )}

      {!loading && !errorMsg && adminProfile && (
        <>
          <section className="border rounded p-4 space-y-1">
            <p className="text-sm">
              Logueado como{" "}
              <strong>
                {adminProfile.email ??
                  adminProfile.display_name ??
                  adminProfile.full_name}
              </strong>{" "}
              (rol: <strong>{adminProfile.role}</strong>)
            </p>
            <p className="text-xs text-slate-500">ID: {adminProfile.id}</p>
          </section>

          <section className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {editingId ? "Editar beneficio" : "Nuevo beneficio"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  className="text-xs underline text-slate-500"
                  onClick={resetForm}
                >
                  Limpiar / nuevo
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Título *</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border rounded px-2 py-1 w-full text-sm"
                    placeholder="Ej: Gorra ALFRA"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Categoría</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border rounded px-2 py-1 w-full text-sm"
                    placeholder="merch, comida, birra..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Resumen</label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm"
                  placeholder="Texto breve..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Detalle</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm min-h-[110px]"
                  placeholder="Aclaraciones, condiciones, etc."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-slate-500">Imagen</label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1 rounded-md text-xs font-medium border bg-slate-900 text-white hover:bg-slate-800"
                    >
                      Subir imagen
                    </button>
                    <span className="text-[11px] text-slate-500 truncate">
                      {selectedFileName}
                    </span>
                  </div>

                  {imageUploading && (
                    <p className="text-xs text-slate-500">Subiendo imagen...</p>
                  )}
                  {imageUploadMessage && (
                    <p className="text-xs text-slate-500">{imageUploadMessage}</p>
                  )}

                  {imageUrl && (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-500 mb-1">
                        Vista previa:
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Vista previa"
                        className="h-24 rounded-md object-cover border"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Costo (puntos) *</label>
                    <input
                      type="number"
                      value={pointsCost}
                      onChange={(e) => setPointsCost(Number(e.target.value))}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="8000"
                      min={0}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Extra $ (opcional)</label>
                    <input
                      type="number"
                      value={cashExtra}
                      onChange={(e) => setCashExtra(Number(e.target.value))}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="2000"
                      min={0}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="is_active"
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <label htmlFor="is_active" className="text-sm text-slate-600">
                      Activo
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="is_published"
                      type="checkbox"
                      checked={isPublished}
                      onChange={(e) => setIsPublished(e.target.checked)}
                    />
                    <label htmlFor="is_published" className="text-sm text-slate-600">
                      Publicado (visible en la app)
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="border rounded px-3 py-1 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear beneficio"}
              </button>

              {formMessage && (
                <p className="text-xs text-slate-500">{formMessage}</p>
              )}
            </form>
          </section>

          <section className="border rounded p-4 space-y-2">
            <h2 className="font-semibold">Listado</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 pr-2">Fecha</th>
                    <th className="text-left py-1 pr-2">Título</th>
                    <th className="text-left py-1 pr-2">Costo</th>
                    <th className="text-left py-1 pr-2">Estado</th>
                    <th className="text-right py-1 pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((n) => (
                    <tr key={n.id} className="border-b last:border-0">
                      <td className="py-1 pr-2">
                        {new Date(n.created_at).toLocaleString()}
                      </td>
                      <td className="py-1 pr-2">{n.title}</td>
                      <td className="py-1 pr-2">
                        {n.points_cost} pts
                        {n.cash_extra > 0 ? ` + $${n.cash_extra}` : ""}
                      </td>
                      <td className="py-1 pr-2">
                        {n.is_published ? (
                          <span className="text-green-700 font-semibold">Publicado</span>
                        ) : (
                          <span className="text-slate-500">Borrador</span>
                        )}{" "}
                        {!n.is_active && (
                          <span className="text-amber-700 font-semibold">(Inactivo)</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right space-x-1">
                        <button
                          className="border rounded px-2 py-1 text-[10px]"
                          onClick={() => startEdit(n)}
                        >
                          Editar
                        </button>
                        <button
                          className="border rounded px-2 py-1 text-[10px]"
                          onClick={() => handleDelete(n)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-2 text-center text-slate-500">
                        Todavía no hay beneficios cargados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
