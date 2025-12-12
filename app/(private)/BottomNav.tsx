"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav({ role }: { role: string | null }) {
  const pathname = usePathname();

  // 1. Botones base para TODOS (Clientes y Staff)
  const navItems = [
    { href: "/dashboard", label: "Inicio", icon: "🏠" },
    { href: "/carta", label: "Carta", icon: "🍔" }, // Tu tienda
    { href: "/mis-pedidos", label: "Mis Pedidos", icon: "🧾" }, // Historial cliente
    { href: "/perfil", label: "Perfil", icon: "👤" }, // Datos y Logout
  ];

  // 2. Si es DELIVERY, le agregamos su herramienta de trabajo
  if (role === "delivery") {
    // Lo insertamos en el medio o al final, donde prefieras.
    // Aquí lo pongo al centro para que sea fácil de tocar con el pulgar.
    navItems.splice(2, 0, { href: "/delivery", label: "Repartir", icon: "🛵" });
  }

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
            <span className={`text-xl mb-0.5 ${isActive ? "scale-110" : ""}`}>{item.icon}</span>
            <span className="text-[10px] font-bold tracking-wide uppercase">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}