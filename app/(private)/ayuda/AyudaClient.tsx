"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CHATBASE_SCRIPT_ID = "chatbase-script";

function loadChatbase() {
  if (document.getElementById(CHATBASE_SCRIPT_ID)) return;

  const w = window as any;

  // Init proxy (snippet oficial)
  if (!w.chatbase || w.chatbase("getState") !== "initialized") {
    w.chatbase = (...args: any[]) => {
      if (!w.chatbase.q) w.chatbase.q = [];
      w.chatbase.q.push(args);
    };

    w.chatbase = new Proxy(w.chatbase, {
      get(target, prop) {
        if (prop === "q") return (target as any).q;
        return (...args: any[]) => (target as any)(prop, ...args);
      },
    });
  }

  const script = document.createElement("script");
  script.id = CHATBASE_SCRIPT_ID;
  script.src = "https://www.chatbase.co/embed.min.js";
  (script as any).domain = "www.chatbase.co";
  document.body.appendChild(script);
}

function unloadChatbase() {
  const w = window as any;

  // Eliminar script
  const script = document.getElementById(CHATBASE_SCRIPT_ID);
  if (script) script.remove();

  // Eliminar iframes / botones creados por Chatbase
  document
    .querySelectorAll("iframe[src*='chatbase'], div[id*='chatbase']")
    .forEach((el) => el.remove());

  // Reset global
  if (w.chatbase) {
    try {
      delete w.chatbase;
    } catch {
      w.chatbase = undefined;
    }
  }
}

export default function AyudaClient() {
  const [openTried, setOpenTried] = useState(false);

  useEffect(() => {
    loadChatbase();

    return () => {
      unloadChatbase(); // 🔥 limpieza TOTAL al salir de /ayuda
    };
  }, []);

  const tryOpenChat = () => {
    setOpenTried(true);
    const w = window as any;
    if (typeof w.chatbase === "function") {
      try {
        w.chatbase("open");
      } catch {}
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      <div className="px-4 sm:px-6">
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg">
          <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
            Soporte
          </p>

          <h1 className="text-2xl font-black mt-1">Ayuda ALFRA IA</h1>

          <p className="text-sm text-slate-200 mt-2 max-w-2xl">
            Consultas sobre la app, puntos, sellos, vouchers y derivación a WhatsApp.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={tryOpenChat}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-3 rounded-xl transition active:scale-[0.99]"
              type="button"
            >
              Abrir chat
            </button>

            <Link
              href="/dashboard"
              className="bg-white/10 hover:bg-white/15 text-white font-bold px-4 py-3 rounded-xl border border-white/10"
            >
              Volver al inicio
            </Link>

            <Link
              href="/legales"
              className="bg-white/10 hover:bg-white/15 text-white font-bold px-4 py-3 rounded-xl border border-white/10"
            >
              Legales
            </Link>
          </div>

          {openTried && (
            <p className="text-[11px] text-slate-300 mt-3">
              Si no se abre automáticamente, tocá el ícono de chat que aparece abajo a la derecha.
            </p>
          )}
        </div>

        <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-700">
          <p className="font-bold mb-2">Tips rápidos</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Reservas o pedidos: ALFRA IA te deriva al WhatsApp correcto.</li>
            <li>Puntos/sellos/vouchers: deriva a Ayuda/Reclamos APP.</li>
            <li>No compartas contraseñas ni datos sensibles.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
