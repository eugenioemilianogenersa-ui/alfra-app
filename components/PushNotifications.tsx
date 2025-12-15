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
        // 1️⃣ Obtener usuario logueado
        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!user) return; // sin usuario no guardamos nada

        // 2️⃣ Registrar Service Worker
        const reg = await navigator.serviceWorker.register("/sw.js");

        // 3️⃣ Pedir permiso
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") return;

        // 4️⃣ Suscribirse a Push
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        // 5️⃣ Guardar suscripción en backend (CON userId)
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id, // 👈 CLAVE
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
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
