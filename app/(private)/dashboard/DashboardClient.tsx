"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function StampGrid({ current }: { current: number }) {
  const total = 8;
  const safe = Math.max(0, Math.min(total, Number(current || 0)));

  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-slate-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
            Sellos AlFra
          </p>
          <p className="text-sm text-slate-700">
            {safe >= total ? (
              <span className="font-bold text-emerald-700">¡Premio desbloqueado!</span>
            ) : (
              <>
                Llevás <span className="font-bold">{safe}</span>/<span className="font-bold">{total}</span>
              </>
            )}
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${
              safe >= total
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            {safe >= total ? "CANJEAR" : `Faltan ${total - safe}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < safe;
          return (
            <div
              key={i}
              className={`rounded-2xl border flex items-center justify-center aspect-square ${
                filled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={filled ? "/stamps/stamp-filled.png" : "/stamps/stamp-empty.png"}
                alt={filled ? "Sello ganado" : "Sello pendiente"}
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Máximo 1 sello por día • Se obtiene con compra mínima.
      </p>
    </div>
  );
}

export default function DashboardClient() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Hola");
  const [points, setPoints] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [news, setNews] = useState<any[]>([]);

  useEffect(() => {
    let channel: any;

    async function loadData() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const isPreviewMode = searchParams.get("preview") === "true";

      // ✅ Rol por RPC (no depende de RLS de profiles)
      const { data: roleRpc } = await supabase.rpc("get_my_role");
      const userRole = String(roleRpc || "cliente").toLowerCase();

      if (!isPreviewMode) {
        if (userRole === "admin") {
          router.replace("/admin");
          return;
        }
        if (userRole === "delivery") {
          router.replace("/delivery");
          return;
        }
        if (userRole === "staff") {
          router.replace("/admin");
          return;
        }
      }

      // ✅ Nombre
      try {
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();

        if (!profErr) {
          const dn = (profile?.display_name || "").trim();
          if (dn) setUserName(dn.split(" ")[0]);
          else setUserName((user.email || "Hola").split("@")[0] || "Hola");
        } else {
          setUserName((user.email || "Hola").split("@")[0] || "Hola");
        }
      } catch {
        setUserName((user.email || "Hola").split("@")[0] || "Hola");
      }

      // ✅ Puntos
      const { data: wallet } = await supabase
        .from("loyalty_wallets")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wallet?.points != null) setPoints(Number(wallet.points) || 0);

      // ✅ Sellos
      const { data: sw } = await supabase
        .from("stamps_wallet")
        .select("current_stamps")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sw?.current_stamps != null) setStamps(Number(sw.current_stamps) || 0);

      // ✅ News
      const { data: newsData } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);

      if (newsData) setNews(newsData);

      setLoading(false);

      // ✅ Realtime: puntos + sellos (INSERT + UPDATE)
      channel = supabase
        .channel("public:wallets_global")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "loyalty_wallets" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === user.id) setPoints(Number(n.points) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === user.id) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "stamps_wallet" },
          (payload) => {
            const n: any = payload.new;
            if (n?.user_id === user.id) setStamps(Number(n.current_stamps) || 0);
          }
        )
        .subscribe();
    }

    loadData();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        Cargando...
      </div>
    );
  }

  const isPreview = searchParams.get("preview") === "true";

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      {isPreview && (
        <div className="bg-amber-100 text-amber-800 text-xs text-center py-1 font-bold fixed top-0 w-full z-50">
          👁️ MODO VISTA PREVIA
        </div>
      )}

      <div
        className={`bg-slate-900 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden ${
          isPreview ? "mt-6" : ""
        }`}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="relative z-10">
          <p className="text-slate-400 text-sm mb-1">Bienvenido,</p>
          <h1 className="text-2xl font-bold capitalize mb-6">{userName} 👋</h1>

          <div className="flex items-center justify-between bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 transition-all duration-300">
            <div>
              <p className="text-xs text-emerald-300 font-bold tracking-wider uppercase mb-1">
                Tus Puntos AlFra
              </p>
              <p className="text-3xl font-black text-amber-400 transition-all">
                {points}
              </p>
            </div>

            <Link
              href="/puntos"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full transition-transform active:scale-95"
            >
              Ver Historial
            </Link>
          </div>
        </div>
      </div>

      {/* ✅ Sellos en primer plano */}
      <div className="px-6 -mt-4 relative z-20">
        <StampGrid current={stamps} />
      </div>

      <div className="px-6 mt-6">
        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-100">
          <h2 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wide">
            Servicios
          </h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Link href="/carta" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-xl">
                🍔
              </div>
              <span className="text-[10px] font-medium text-slate-600">Carta</span>
            </Link>
            <Link href="/choperas" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl">
                🍺
              </div>
              <span className="text-[10px] font-medium text-slate-600">Choperas</span>
            </Link>
            <Link href="/Beneficios" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center text-xl">
                💯​
              </div>
              <span className="text-[10px] font-medium text-slate-600">Beneficios</span>
            </Link>
            <Link href="/mis-pedidos" className="flex flex-col items-center gap-2 group">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-xl">
                🛵
              </div>
              <span className="text-[10px] font-medium text-slate-600">Seguimiento</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-slate-800">Novedades & Eventos</h2>
        </div>

        <div className="space-y-4">
          {news.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-400 text-sm">
              <p>No hay novedades.</p>
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="h-32 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-600 line-clamp-2">{item.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
