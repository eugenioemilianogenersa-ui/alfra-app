// C:\Dev\alfra-app\components\PushNotifications.tsx
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function PushNotifications() {
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) return;

    const supabase = createClient();

    (async () => {
      try {
        // ✅ token real
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session?.access_token) return;

        // 1) Registrar SW (si ya existe, no rompe)
        await navigator.serviceWorker.register("/sw.js");

        // ✅ 2) Esperar a que el SW esté ACTIVO (evita: "no active Service Worker")
        const readyReg = await navigator.serviceWorker.ready;

        // 3) Pedir permiso
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") return;

        // 4) VAPID
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        // ✅ 5) No re-suscribir si ya existe
        const existing = await readyReg.pushManager.getSubscription();
        const sub =
          existing ??
          (await readyReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }));

        // 6) Guardar subscription
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: sub.toJSON().keys,
            userAgent: navigator.userAgent,
          }),
        });
      } catch (err) {
        console.error("PushNotifications error:", err);
      }
    })();
  }, []);

  return null;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
