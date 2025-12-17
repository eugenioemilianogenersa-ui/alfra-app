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
    router.replace("/login"); // ajustá si tu login es otra ruta
    router.refresh();
  };

  // ✅ Menú base (cliente/admin)
  const navItemsBase = [
    { href: "/dashboard", label: "Inicio", icon: "🏠" },
    { href: "/carta", label: "Carta", icon: "🍔" },
    { href: "/mis-pedidos", label: "Mis Pedidos", icon: "🧾" },
    { href: "/perfil", label: "Perfil", icon: "👤" },
  ];

  // ✅ Menú delivery: SOLO Repartir + Perfil (y botón cerrar sesión aparte)
  const navItemsDelivery = [
    { href: "/delivery", label: "Repartir", icon: "🛵" },
    { href: "/perfil", label: "Perfil", icon: "👤" },
  ];

  const isDelivery = role === "delivery";
  const navItems = isDelivery ? navItemsDelivery : navItemsBase;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 h-16 flex items-center justify-around z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200
              ${isActive ? "text-emerald-700 bg-emerald-50/50" : "text-slate-400 hover:text-slate-600"}`}
          >
            <span className={`text-xl mb-0.5 ${isActive ? "scale-110" : ""}`}>
              {item.icon}
            </span>
            <span className="text-[10px] font-bold tracking-wide uppercase">
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* ✅ Botón Cerrar sesión SOLO para delivery */}
      {isDelivery && (
        <button
          onClick={logout}
          className="flex flex-col items-center justify-center w-full h-full transition-all duration-200 text-red-600 hover:text-red-700"
        >
          <span className="text-xl mb-0.5">⛔</span>
          <span className="text-[10px] font-bold tracking-wide uppercase">
            Salir
          </span>
        </button>
      )}
    </nav>
  );
}
