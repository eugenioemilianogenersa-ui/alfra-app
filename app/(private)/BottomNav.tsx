"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function BottomNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  // ✅ Menú base (cliente/admin preview)
  const navItemsBase = [
    { href: "/dashboard", label: "Inicio", icon: "🏠" },
    { href: "/carta", label: "Carta", icon: "🍔" },
    { href: "/mis-pedidos", label: "Mis Pedidos", icon: "🧾" },
    { href: "/perfil", label: "Perfil", icon: "👤" },
  ];

  // ✅ Menú delivery
  const navItemsDelivery = [
    { href: "/delivery", label: "Repartir", icon: "🛵" },
    { href: "/perfil", label: "Perfil", icon: "👤" },
  ];

  const isDelivery = (role || "").toLowerCase() === "delivery";
  const navItems = isDelivery ? navItemsDelivery : navItemsBase;

  const isActiveRoute = (href: string) => {
    if (pathname === href) return true;
    return pathname.startsWith(href + "/"); // soporta rutas hijas
  };

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-50
        bg-white/95 backdrop-blur
        border-t border-slate-200
        shadow-[0_-5px_15px_rgba(0,0,0,0.05)]
        pb-safe
      "
      aria-label="Navegación inferior"
    >
      {/* Contenedor centrado para tablet/desktop */}
      <div className="mx-auto flex h-16 items-stretch justify-around w-full max-w-3xl">
        {navItems.map((item) => {
          const active = isActiveRoute(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-1 flex-col items-center justify-center
                transition-all duration-200 select-none
                ${active ? "text-emerald-700 bg-emerald-50/60" : "text-slate-400 hover:text-slate-600"}
              `}
              aria-current={active ? "page" : undefined}
            >
              <span className={`text-xl mb-0.5 transition-transform ${active ? "scale-110" : ""}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-bold tracking-wide uppercase">{item.label}</span>
            </Link>
          );
        })}

        {/* ✅ Botón Cerrar sesión SOLO para delivery */}
        {isDelivery && (
          <button
            onClick={logout}
            className="flex flex-1 flex-col items-center justify-center transition-all duration-200 text-red-600 hover:text-red-700"
            type="button"
          >
            <span className="text-xl mb-0.5">⛔</span>
            <span className="text-[10px] font-bold tracking-wide uppercase">Salir</span>
          </button>
        )}
      </div>
    </nav>
  );
}
