"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CHATBASE_SCRIPT_ID = "chatbase-script";
const CHATBASE_SRC = "https://www.chatbase.co/embed.min.js";

function initChatbaseProxy() {
  const w = window as any;

  // Snippet oficial (proxy)
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
    if (document.getElementById(CHATBASE_SCRIPT_ID)) {
      resolve();
      return;
    }

    initChatbaseProxy();

    const script = document.createElement("script");
    script.id = CHATBASE_SCRIPT_ID;
    script.src = CHATBASE_SRC;
    (script as any).domain = "www.chatbase.co";
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chatbase script failed to load"));

    document.body.appendChild(script);
  });
}

function isChatbaseReady(): boolean {
  const w = window as any;
  // Con el embed, esto puede variar; validamos que sea function y que no explote getState
  if (typeof w.chatbase !== "function") return false;
  try {
    // Si ya está inicializado, mejor
    const st = w.chatbase("getState");
    return st === "initialized" || st === "ready" || st === "open" || st === "closed";
  } catch {
    // Si getState no responde aún, no está listo
    return false;
  }
}

async function waitChatbaseReady(timeoutMs = 6000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isChatbaseReady()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

function unloadChatbase() {
  const w = window as any;

  // 1) remover script
  const script = document.getElementById(CHATBASE_SCRIPT_ID);
  if (script) script.remove();

  // 2) remover nodos típicos del widget (varía según versión)
  document.querySelectorAll("iframe[src*='chatbase']").forEach((el) => el.remove());

  // algunos embeds crean contenedores sueltos; limpiamos genérico sin romper tu UI
  document.querySelectorAll("[id*='chatbase'], [class*='chatbase']").forEach((el) => {
    // Ojo: evitamos tocar tu contenido si algún día usás “chatbase” como clase (no parece el caso)
    (el as HTMLElement).remove();
  });

  // 3) reset global
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

    // No cargamos automáticamente: lo hacemos on-demand al tocar “Abrir chat”.
    // Pero dejamos el teardown sí o sí.
    return () => {
      mountedRef.current = false;
      unloadChatbase();
    };
  }, []);

  const tryOpenChat = async () => {
    setOpenTried(true);
    setStatus("loading");

    try {
      await ensureChatbaseScript();

      // esperar a que el embed inicialice
      const ready = await waitChatbaseReady(6000);
      if (!mountedRef.current) return;

      const w = window as any;
      if (typeof w.chatbase === "function") {
        // Intentos compatibles (según versión)
        try {
          w.chatbase("open");
          setStatus("idle");
          return;
        } catch {}
        try {
          w.chatbase("show");
          setStatus("idle");
          return;
        } catch {}

        // Si no existe open/show, al menos dejamos que aparezca el botón
        if (ready) {
          setStatus("idle");
          return;
        }
      }

      setStatus("error");
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
              No se pudo abrir el chat. Probá recargar la página o revisar conexión.
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
