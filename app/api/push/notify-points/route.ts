import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  try {
    const { userId, delta, reason } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId requerido" },
        { status: 400 }
      );
    }

    // 🔐 inicializar web-push (VAPID)
    initWebPush();

    // 🔎 traer suscripciones del usuario
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("DB error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // 📦 payload
    const payload = {
      title: "AlFra – Puntos",
      body: `${delta > 0 ? "+" : ""}${delta} pts • ${reason}`,
      data: { url: "/puntos" },
    };

    // 🚀 enviar push a todas las suscripciones
    for (const sub of subs) {
      await sendToSubscription(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        payload
      );
    }

    return NextResponse.json({ ok: true, sent: subs.length });
  } catch (err) {
    console.error("notify-points error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
