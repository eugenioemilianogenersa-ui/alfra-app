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

type ChoperaRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  price: string | null;
  capacity: string | null;
  conditions: string | null;
  is_published: boolean;
  published_at: string | null;
};

export default function AdminChoperasClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);

  const [rows, setRows] = useState<ChoperaRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [conditions, setConditions] = useState("");
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

      const user = userData.user;

      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profError) {
        setErrorMsg(`Error al leer profiles: ${profError.code} - ${profError.message}`);
        setLoading(false);
        return;
      }
      if (!prof) {
        setErrorMsg("No se encontró perfil para id = " + user.id);
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
        .from("choperas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(`Error al cargar choperas: ${error.code} - ${error.message}`);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as ChoperaRow[]);
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
    setPrice("");
    setCapacity("");
    setConditions("");
    setIsPublished(false);
    setFormMessage(null);
    setImageUploadMessage(null);
    setSelectedFileName("Ningún archivo seleccionado");
  }

  function startEdit(n: ChoperaRow) {
    setEditingId(n.id);
    setTitle(n.title);
    setSummary(n.summary ?? "");
    setContent(n.content ?? "");
    setImageUrl(n.image_url ?? "");
    setCategory(n.category ?? "");
    setPrice(n.price ?? "");
    setCapacity(n.capacity ?? "");
    setConditions(n.conditions ?? "");
    setIsPublished(n.is_published);
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
        .from("choperas-images")
        .upload(fileName, file);

      if (error) {
        setImageUploadMessage(`Error al subir imagen: ${error.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("choperas-images")
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

    setSaving(true);
    setFormMessage(null);

    try {
      const nowIso = new Date().toISOString();
      const published_at_value = isPublished ? nowIso : null;

      if (!editingId) {
        const { data: inserted, error } = await supabase
          .from("choperas")
          .insert({
            title: title.trim(),
            summary: summary.trim() || null,
            content: content.trim() || null,
            image_url: imageUrl || null,
            category: category.trim() || null,
            price: price.trim() || null,
            capacity: capacity.trim() || null,
            conditions: conditions.trim() || null,
            is_published: isPublished,
            published_at: published_at_value,
          })
          .select()
          .single();

        if (error) {
          setFormMessage(`Error al crear chopera: ${error.code} - ${error.message}`);
          return;
        }

        if (inserted) {
          setRows((prev) => [inserted as ChoperaRow, ...prev]);
          resetForm();
          setFormMessage("Chopera creada correctamente.");
        }
      } else {
        const { data: updated, error } = await supabase
          .from("choperas")
          .update({
            title: title.trim(),
            summary: summary.trim() || null,
            content: content.trim() || null,
            image_url: imageUrl || null,
            category: category.trim() || null,
            price: price.trim() || null,
            capacity: capacity.trim() || null,
            conditions: conditions.trim() || null,
            is_published: isPublished,
            published_at: isPublished ? published_at_value : null,
          })
          .eq("id", editingId)
          .select()
          .single();

        if (error) {
          setFormMessage(`Error al actualizar chopera: ${error.code} - ${error.message}`);
          return;
        }

        if (updated) {
          setRows((prev) => prev.map((n) => (n.id === editingId ? (updated as ChoperaRow) : n)));
          setFormMessage("Chopera actualizada correctamente.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(n: ChoperaRow) {
    const ok = window.confirm(`¿Eliminar "${n.title}"? Esta acción es permanente.`);
    if (!ok) return;

    const { error } = await supabase.from("choperas").delete().eq("id", n.id);
    if (error) {
      alert(`Error al eliminar: ${error.code} - ${error.message}`);
      return;
    }

    setRows((prev) => prev.filter((x) => x.id !== n.id));
    if (editingId === n.id) resetForm();
  }

  return (
    <main className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Choperas</h1>

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
                {adminProfile.email ?? adminProfile.display_name ?? adminProfile.full_name}
              </strong>{" "}
              (rol: <strong>{adminProfile.role}</strong>)
            </p>
            <p className="text-xs text-slate-500">ID: {adminProfile.id}</p>
          </section>

          <section className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{editingId ? "Editar chopera" : "Nueva chopera"}</h2>
              {editingId && (
                <button type="button" className="text-xs underline text-slate-500" onClick={resetForm}>
                  Limpiar / nueva
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Título *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm"
                  placeholder="Ej: Chopera 30L + CO2"
                />
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
                  className="border rounded px-2 py-1 w-full text-sm min-h-[100px]"
                  placeholder="Más info, eventos, etc."
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
                    <span className="text-[11px] text-slate-500 truncate">{selectedFileName}</span>
                  </div>

                  {imageUploading && <p className="text-xs text-slate-500">Subiendo imagen...</p>}
                  {imageUploadMessage && <p className="text-xs text-slate-500">{imageUploadMessage}</p>}

                  {imageUrl && (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-500 mb-1">Vista previa:</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Vista previa" className="h-24 rounded-md object-cover border" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Categoría</label>
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="evento, alquiler..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Precio</label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="$45.000 / día"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Capacidad</label>
                    <input
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="30L / 50L"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Condiciones</label>
                    <input
                      value={conditions}
                      onChange={(e) => setConditions(e.target.value)}
                      className="border rounded px-2 py-1 w-full text-sm"
                      placeholder="Incluye CO2..."
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <input
                      id="is_published"
                      type="checkbox"
                      checked={isPublished}
                      onChange={(e) => setIsPublished(e.target.checked)}
                    />
                    <label htmlFor="is_published" className="text-sm text-slate-600">
                      Publicada (visible en la app)
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="border rounded px-3 py-1 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear chopera"}
              </button>

              {formMessage && <p className="text-xs text-slate-500">{formMessage}</p>}
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
                    <th className="text-left py-1 pr-2">Estado</th>
                    <th className="text-right py-1 pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((n) => (
                    <tr key={n.id} className="border-b last:border-0">
                      <td className="py-1 pr-2">{new Date(n.created_at).toLocaleString()}</td>
                      <td className="py-1 pr-2">{n.title}</td>
                      <td className="py-1 pr-2">
                        {n.is_published ? (
                          <span className="text-green-700 font-semibold">Publicada</span>
                        ) : (
                          <span className="text-slate-500">Borrador</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right space-x-1">
                        <button className="border rounded px-2 py-1 text-[10px]" onClick={() => startEdit(n)}>
                          Editar
                        </button>
                        <button className="border rounded px-2 py-1 text-[10px]" onClick={() => handleDelete(n)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-slate-500">
                        Todavía no hay choperas cargadas.
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
