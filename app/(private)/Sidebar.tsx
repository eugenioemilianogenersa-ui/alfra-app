"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function Sidebar({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const ROLE = (role || "").toLowerCase();
  const isAdmin = ROLE === "admin";
  const isStaff = ROLE === "staff";

  const adminLinks = [
    { href: "/admin", label: "Métricas / Inicio", icon: "📊" },
    { href: "/admin/usuarios", label: "Gestión Usuarios", icon: "👥" },
    { href: "/admin/puntos", label: "Gestión Puntos", icon: "💎" },
    { href: "/admin/beneficios", label: "Beneficios", icon: "🏪" },
    { href: "/admin/choperas", label: "Choperas", icon: "🍻" },
    { href: "/admin/sellos", label: "Gestión Sellos", icon: "🧷" },
    { href: "/admin/vouchers", label: "Vouchers (Canjes)", icon: "🎟️" },
    { href: "/admin/pedidos", label: "Gestión Pedidos", icon: "📦" },
    { href: "/admin/repartidores-fudo", label: "Mapeo Fudo Delivery", icon: "🛵" },
    { href: "/admin/delivery-tracking", label: "Tracking Delivery", icon: "📍" },
    { href: "/admin/news", label: "Noticias", icon: "📰" },
  ];

  const staffLinks = [
    { href: "/admin/usuarios", label: "Gestión Usuarios", icon: "👥" },
    { href: "/admin/puntos", label: "Gestión Puntos", icon: "💎" },
    { href: "/admin/sellos", label: "Gestión Sellos", icon: "🧷" },
    { href: "/admin/vouchers", label: "Vouchers (Canjes)", icon: "🎟️" },
    { href: "/admin/pedidos", label: "Gestión Pedidos", icon: "📦" },
  ];

  const links = isAdmin ? adminLinks : isStaff ? staffLinks : [];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    onClose();
  }

  return (
    <>
      {/* Overlay (solo mobile) */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed z-40 top-0 left-0 h-full w-72 bg-slate-900 text-white border-r border-slate-800 flex flex-col shadow-2xl
        transform transition-transform duration-300 ease-in-out
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:static lg:translate-x-0 lg:shadow-none`}
      >
        <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
            A
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide">{isAdmin ? "ALFRA ADMIN" : isStaff ? "ALFRA STAFF" : "ALFRA"}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Panel de Control</p>
          </div>

          <button onClick={onClose} className="ml-auto p-2 text-slate-400 hover:text-white lg:hidden">
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
          <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Gestión General</p>

          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-3 transition-all duration-200
                ${
                  active
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span className="text-lg">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}

          {isAdmin && (
            <div className="mt-8 border-t border-slate-800 pt-6">
              <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Accesos Directos</p>
              <Link
                href="/dashboard?preview=true"
                className="rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-3 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition-colors border border-dashed border-slate-700 hover:border-emerald-400/50"
              >
                👁️ Ver como Cliente
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0 pb-safe">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-300 rounded-lg py-3 text-sm font-medium hover:bg-red-900/30 hover:text-red-400 transition-all border border-slate-700 hover:border-red-900/50"
          >
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
