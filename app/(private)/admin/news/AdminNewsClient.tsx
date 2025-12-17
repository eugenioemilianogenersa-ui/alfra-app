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

type NewsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  is_published: boolean;
  published_at: string | null;
};

export default function AdminNewsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);

  const [news, setNews] = useState<NewsRow[]>([]);

  // formulario
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [wasPublished, setWasPublished] = useState(false); // anti-spam
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(
    null
  );
  const [selectedFileName, setSelectedFileName] = useState(
    "Ningún archivo seleccionado"
  );
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
        setErrorMsg(
          `Error al leer profiles: ${profError.code} - ${profError.message}`
        );
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

      const { data: newsData, error: newsError } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false });

      if (newsError) {
        setErrorMsg(
          `Error al cargar noticias: ${newsError.code} - ${newsError.message}`
        );
        setLoading(false);
        return;
      }

      setNews((newsData ?? []) as NewsRow[]);
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
    setIsPublished(false);
    setWasPublished(false);
    setFormMessage(null);
    setImageUploadMessage(null);
    setSelectedFileName("Ningún archivo seleccionado");
  }

  function startEdit(n: NewsRow) {
    setEditingId(n.id);
    setTitle(n.title);
    setSummary(n.summary ?? "");
    setContent(n.content ?? "");
    setImageUrl(n.image_url ?? "");
    setCategory(n.category ?? "");
    setIsPublished(n.is_published);
    setWasPublished(n.is_published);
    setFormMessage(null);
    setImageUploadMessage(null);
    setSelectedFileName("Imagen ya cargada");
  }

  async function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploading(true);
    setImageUploadMessage(null);
    setSelectedFileName(file.name);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("news-images")
        .upload(fileName, file);

      if (error) {
        setImageUploadMessage(`Error al subir imagen: ${error.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("news-images")
        .getPublicUrl(data.path);

      setImageUrl(publicData.publicUrl);
      setImageUploadMessage("Imagen subida correctamente.");
    } finally {
      setImageUploading(false);
    }
  }

  // ✅ FIX: manda Authorization Bearer token (evita 401 en /api/push/notify-news)
  async function fireNewsPush(params: {
    newsId: string;
    title: string;
    summary: string | null;
  }) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) {
      console.error("No access token for notify-news");
      return;
    }

    await fetch("/api/push/notify-news", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        newsId: params.newsId,
        title: params.title,
        summary: params.summary || "Entrá a ver la novedad.",
      }),
    });
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
          .from("news")
          .insert({
            title: title.trim(),
            summary: summary.trim() || null,
            content: content.trim() || null,
            image_url: imageUrl || null,
            category: category.trim() || null,
            is_published: isPublished,
            published_at: published_at_value,
          })
          .select()
          .single();

        if (error) {
          setFormMessage(
            `Error al crear noticia: ${error.code} - ${error.message}`
          );
          return;
        }

        if (inserted) {
          // ✅ PUSH solo si se crea publicada
          if (isPublished) {
            await fireNewsPush({
              newsId: inserted.id,
              title: inserted.title,
              summary: inserted.summary,
            });
          }

          setNews((prev) => [inserted as NewsRow, ...prev]);
          resetForm();
          setFormMessage("Noticia creada correctamente.");
        }
      } else {
        const { data: updated, error } = await supabase
          .from("news")
          .update({
            title: title.trim(),
            summary: summary.trim() || null,
            content: content.trim() || null,
            image_url: imageUrl || null,
            category: category.trim() || null,
            is_published: isPublished,
            published_at: isPublished ? published_at_value : null,
          })
          .eq("id", editingId)
          .select()
          .single();

        if (error) {
          setFormMessage(
            `Error al actualizar noticia: ${error.code} - ${error.message}`
          );
          return;
        }

        if (updated) {
          // ✅ PUSH solo si pasa de borrador → publicada
          if (!wasPublished && isPublished) {
            await fireNewsPush({
              newsId: updated.id,
              title: updated.title,
              summary: updated.summary,
            });
          }

          setNews((prev) =>
            prev.map((n) => (n.id === editingId ? (updated as NewsRow) : n))
          );

          setWasPublished(isPublished);
          setFormMessage("Noticia actualizada correctamente.");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(n: NewsRow) {
    const ok = window.confirm(
      `¿Eliminar la noticia "${n.title}"? Esta acción es permanente.`
    );
    if (!ok) return;

    const { error } = await supabase.from("news").delete().eq("id", n.id);

    if (error) {
      alert(`Error al eliminar noticia: ${error.code} - ${error.message}`);
      return;
    }

    setNews((prev) => prev.filter((x) => x.id !== n.id));

    if (editingId === n.id) {
      resetForm();
    }
  }

  return (
    <main className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Novedades / Noticias</h1>

      {loading && (
        <p className="text-sm text-muted-foreground">
          Cargando datos del panel...
        </p>
      )}

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
            <p className="text-xs text-muted-foreground">ID: {adminProfile.id}</p>
          </section>

          <section className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {editingId ? "Editar noticia" : "Nueva noticia"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={resetForm}
                >
                  Limpiar formulario / nueva
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm"
                  placeholder="Ej: Nueva IPA de temporada"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Resumen corto
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm"
                  placeholder="Texto breve para listados..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Contenido / detalle
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="border rounded px-2 py-1 w-full text-sm min-h-[120px]"
                  placeholder="Descripción más larga, info de evento, etc."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-muted-foreground">
                    Imagen (PC / galería / cámara)
                  </label>

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
                      <img
                        src={imageUrl}
                        alt="Vista previa"
                        className="h-24 rounded-md object-cover border"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Categoría</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border rounded px-2 py-1 w-full text-sm"
                    placeholder="birra, evento, convenio..."
                  />

                  <div className="flex items-center gap-2 mt-3">
                    <input
                      id="is_published"
                      type="checkbox"
                      checked={isPublished}
                      onChange={(e) => setIsPublished(e.target.checked)}
                    />
                    <label
                      htmlFor="is_published"
                      className="text-sm text-muted-foreground"
                    >
                      Publicada (visible en la app)
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="border rounded px-3 py-1 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving
                    ? "Guardando..."
                    : editingId
                    ? "Guardar cambios"
                    : "Crear noticia"}
                </button>
              </div>

              {formMessage && (
                <p className="text-xs text-muted-foreground">{formMessage}</p>
              )}
            </form>
          </section>

          <section className="border rounded p-4 space-y-2">
            <h2 className="font-semibold">Listado de noticias</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 pr-2">Fecha</th>
                    <th className="text-left py-1 pr-2">Título</th>
                    <th className="text-left py-1 pr-2">Categoría</th>
                    <th className="text-left py-1 pr-2">Estado</th>
                    <th className="text-right py-1 pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {news.map((n) => (
                    <tr key={n.id} className="border-b last:border-0">
                      <td className="py-1 pr-2">
                        {new Date(n.created_at).toLocaleString()}
                      </td>
                      <td className="py-1 pr-2">{n.title}</td>
                      <td className="py-1 pr-2">
                        {n.category ?? <span className="text-slate-400">-</span>}
                      </td>
                      <td className="py-1 pr-2">
                        {n.is_published ? (
                          <span className="text-green-700 font-semibold">
                            Publicada
                          </span>
                        ) : (
                          <span className="text-slate-500">Borrador</span>
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
                  {news.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-2 text-center text-muted-foreground"
                      >
                        Todavía no hay noticias cargadas.
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
