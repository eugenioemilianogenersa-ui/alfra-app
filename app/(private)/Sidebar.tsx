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

  // Links completos Admin
  const adminLinks = [
    { href: "/admin", label: "Métricas / Inicio", icon: "📊" },
    { href: "/admin/usuarios", label: "Gestión Usuarios", icon: "👥" },
    { href: "/admin/puntos", label: "Gestión Puntos", icon: "💎" },
    { href: "/admin/sellos", label: "Gestión Sellos", icon: "🧷" },
    { href: "/admin/pedidos", label: "Gestión Pedidos", icon: "📦" },
    { href: "/admin/repartidores-fudo", label: "Mapeo Fudo Delivery", icon: "🛵" },
    { href: "/admin/delivery-tracking", label: "Tracking Delivery", icon: "📍" },
    { href: "/admin/news", label: "Noticias", icon: "📰" },
  ];

  // Links STAFF (solo lo que pediste)
  const staffLinks = [
    { href: "/admin/usuarios", label: "Gestión Usuarios", icon: "👥" },
    { href: "/admin/puntos", label: "Gestión Puntos", icon: "💎" },
    { href: "/admin/sellos", label: "Gestión Sellos", icon: "🧷" },
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
      {open && (
        <div onClick={onClose} className="fixed inset-0 bg-black/30 z-30 lg:hidden" />
      )}

      <aside
        className={`fixed z-40 top-0 left-0 h-full w-64 bg-slate-900 text-white border-r border-slate-800 flex flex-col transition-transform duration-300 shadow-xl
        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static`}
      >
        <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
            A
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide">
              {isAdmin ? "ALFRA ADMIN" : isStaff ? "ALFRA STAFF" : "ALFRA"}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
              Panel de Control
            </p>
          </div>

          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white lg:hidden">
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 flex flex-col gap-2 overflow-y-auto">
          <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
            Gestión General
          </p>

          {links.map((link) => {
            const active = pathname === link.href;
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
                <span>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}

          {isAdmin && (
            <div className="mt-8 border-t border-slate-800 pt-4">
              <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                Accesos Directos
              </p>
              <Link
                href="/dashboard?preview=true"
                className="rounded-lg px-4 py-2 text-xs font-medium flex items-center gap-3 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition-colors"
              >
                👁️ Ver como Cliente
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 text-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-red-900/30 hover:text-red-400 transition-all border border-slate-700 hover:border-red-900/50"
          >
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
