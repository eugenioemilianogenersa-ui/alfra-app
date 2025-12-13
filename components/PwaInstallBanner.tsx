"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOSDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // iOS Safari
  // @ts-expect-error: navigator.standalone exists on iOS Safari
  const iosStandalone = typeof navigator !== "undefined" && navigator.standalone;
  // Other browsers
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  return Boolean(iosStandalone || displayModeStandalone);
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIOS = useMemo(() => isIOSDevice(), []);

  useEffect(() => {
    setInstalled(isStandalone());

    const key = "alfra_pwa_install_dismissed";
    const saved = localStorage.getItem(key);
    if (saved === "1") setDismissed(true);

    const onBeforeInstallPrompt = (e: Event) => {
      // Chrome Android: capturamos el evento y mostramos botón propio
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const close = () => {
    setDismissed(true);
    localStorage.setItem("alfra_pwa_install_dismissed", "1");
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } catch {
      // noop
    }
  };

  // No mostrar si ya está instalada o el usuario la cerró
  if (installed || dismissed) return null;

  // ANDROID (hay prompt real)
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-0 right-0 z-9999 px-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white shadow-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">📲 Instalá AlFra App</p>
              <p className="text-xs text-slate-500 mt-1">
                Abrila como app real (sin navegador) y tenela a mano.
              </p>
            </div>
            <button
              onClick={close}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 rounded-xl bg-emerald-600 text-white text-sm font-bold py-2 hover:bg-emerald-700 active:scale-[0.99]"
            >
              Instalar
            </button>
            <button
              onClick={close}
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  // iOS (no hay prompt real, damos pasos)
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-0 right-0 z-9999 px-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white shadow-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">🍏 Instalación en iPhone</p>
              <p className="text-xs text-slate-500 mt-1">
                Abrí en <b>Safari</b> → <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.
              </p>
            </div>
            <button
              onClick={close}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-slate-600">
            <div className="rounded-xl bg-slate-50 border p-2">
              1) Safari • 2) Botón compartir ⬆️ • 3) “Agregar a inicio”
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={close}
              className="w-full rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ok, entendido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Otros: no mostramos nada
  return null;
}
