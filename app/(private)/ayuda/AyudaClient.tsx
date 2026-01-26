"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CHATBASE_BOT_ID = "H9jhv5J1pN5hjSGBjGGxx"; // ✅ tu bot id real
const CHATBASE_SRC = "https://www.chatbase.co/embed.min.js";

function initChatbaseProxy() {
  const w = window as any;

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
}

function ensureChatbaseScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // ✅ Chatbase identifica el bot por el ID del script (tu BOT_ID)
    if (document.getElementById(CHATBASE_BOT_ID)) {
      resolve();
      return;
    }

    initChatbaseProxy();

    const script = document.createElement("script");
    script.id = CHATBASE_BOT_ID; // ✅ CRÍTICO: debe ser el bot id
    script.src = CHATBASE_SRC;
    script.async = true;
    (script as any).domain = "www.chatbase.co";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chatbase script failed to load"));

    document.body.appendChild(script);
  });
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openChatbaseWithRetries(timeoutMs = 6000) {
  const w = window as any;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (typeof w.chatbase === "function") {
      try {
        w.chatbase("open");
        return true;
      } catch {}
      try {
        w.chatbase("show");
        return true;
      } catch {}
    }
    await wait(150);
  }

  return false;
}

function unloadChatbase() {
  const w = window as any;

  // remover script por bot id
  const script = document.getElementById(CHATBASE_BOT_ID);
  if (script) script.remove();

  // remover iframes del widget
  document.querySelectorAll("iframe[src*='chatbase']").forEach((el) => el.remove());

  // remover wrappers (varía según versión)
  document.querySelectorAll("[id*='chatbase'], [class*='chatbase']").forEach((el) => {
    (el as HTMLElement).remove();
  });

  // reset global
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
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      unloadChatbase(); // ✅ al salir de /ayuda se va la burbuja
    };
  }, []);

  const tryOpenChat = async () => {
    setOpenTried(true);
    setStatus("loading");

    try {
      await ensureChatbaseScript();
      const ok = await openChatbaseWithRetries(7000);
      if (!mountedRef.current) return;

      setStatus(ok ? "idle" : "error");
    } catch {
      if (!mountedRef.current) return;
      setStatus("error");
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-3 rounded-xl transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              type="button"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Abriendo..." : "Abrir chat"}
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

          {openTried && status !== "error" && (
            <p className="text-[11px] text-slate-300 mt-3">
              Si no se abre automáticamente, tocá el ícono de chat que aparece abajo a la derecha.
            </p>
          )}

          {status === "error" && (
            <p className="text-[11px] text-rose-200 mt-3">
              No se pudo abrir el chat. Probá recargar la página (puede ser caché de la PWA).
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
