"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ChatbaseRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const isAyuda = pathname === "/ayuda" || pathname.startsWith("/ayuda/");

    // Marcamos el estado en <html> para que el CSS oculte/permita el widget
    document.documentElement.dataset.chatbase = isAyuda ? "on" : "off";

    // Si salimos de /ayuda: intentamos cerrar el chat (si existe API)
    if (!isAyuda) {
      try {
        const w = window as any;
        if (typeof w.chatbase === "function") {
          try {
            w.chatbase("close");
          } catch {}
          try {
            w.chatbase("hide");
          } catch {}
        }
      } catch {}
    }
  }, [pathname]);

  return null;
}
