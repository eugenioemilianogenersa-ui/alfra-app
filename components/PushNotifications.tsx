"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function PushNotifications() {
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) return;

    const supabase = createClient();

    (async () => {
      try {
        // ✅ Tomamos el token real de sesión
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session?.access_token) return;

        // 1) Registrar SW
        const reg = await navigator.serviceWorker.register("/sw.js");

        // 2) Pedir permiso
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") return;

        // 3) Subscribir
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        // 4) Guardar subscription (backend decide user_id)
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
