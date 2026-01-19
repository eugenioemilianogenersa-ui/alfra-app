// C:\Dev\alfra-app\app\(private)\choperas\ChoperasClient.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type ChoperaRow = {
  id: string;
  created_at: string;
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

function ResponsiveMedia({
  src,
  alt,
  aspectRatio = "16/9",
  fit = "cover",
}: {
  src: string;
  alt: string;
  aspectRatio?: string;
  fit?: "cover" | "contain";
}) {
  return (
    <div className="relative w-full overflow-hidden bg-slate-100" style={{ aspectRatio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 w-full h-full ${
          fit === "contain" ? "object-contain" : "object-cover"
        } object-center`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

export default function ChoperasClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ChoperaRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("choperas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(`Error al cargar choperas: ${error.code} - ${error.message}`);
        setLoading(false);
        return;
      }

      setItems((data ?? []) as ChoperaRow[]);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <header className="text-center space-y-1">
        <h1 className="text-3xl font-bold">Choperas & Eventos</h1>
        <p className="opacity-80 text-sm">Pedidos y consultas para choperas o eventos.</p>
      </header>

      {loading && <p className="text-sm text-slate-500 text-center">Cargando...</p>}

      {!loading && errorMsg && (
        <div className="border border-red-400 bg-red-50 p-4 rounded text-sm">{errorMsg}</div>
      )}

      {!loading && !errorMsg && items.length === 0 && (
        <p className="text-center text-slate-500 text-sm">Todavía no hay choperas publicadas.</p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <article key={c.id} className="border rounded-xl bg-white overflow-hidden shadow-sm">
            {c.image_url ? (
              <ResponsiveMedia src={c.image_url} alt={c.title} aspectRatio="16/9" fit="cover" />
            ) : (
              <div className="w-full bg-linear-to-br from-slate-100 via-white to-slate-100" style={{ aspectRatio: "16/9" }} />
            )}

            <div className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-lg leading-tight">{c.title}</h2>
                {c.category && (
                  <span className="text-[10px] px-2 py-1 rounded-full border bg-slate-50 text-slate-600">
                    {c.category}
                  </span>
                )}
              </div>

              {c.summary && <p className="text-sm text-slate-700">{c.summary}</p>}

              <div className="grid gap-2 text-sm">
                {(c.price || c.capacity) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="border rounded-lg p-2 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Precio</div>
                      <div className="font-semibold">{c.price ?? "-"}</div>
                    </div>
                    <div className="border rounded-lg p-2 bg-slate-50">
                      <div className="text-[11px] text-slate-500">Capacidad</div>
                      <div className="font-semibold">{c.capacity ?? "-"}</div>
                    </div>
                  </div>
                )}

                {c.conditions && (
                  <div className="border rounded-lg p-2 bg-slate-50">
                    <div className="text-[11px] text-slate-500">Condiciones</div>
                    <div className="text-slate-700">{c.conditions}</div>
                  </div>
                )}

                {c.content && (
                  <div className="border rounded-lg p-2">
                    <div className="text-[11px] text-slate-500">Detalle</div>
                    <div className="text-slate-700 whitespace-pre-wrap">{c.content}</div>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
