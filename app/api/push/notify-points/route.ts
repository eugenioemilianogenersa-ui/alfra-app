import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  try {
    const { userId, delta, reason } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    initWebPush();

    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,enabled")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (error) {
      console.error("push_subscriptions select error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    console.log("subs found:", subs?.length ?? 0, "userId:", userId);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "no subs" });
    }

    const payload = {
      title: "AlFra – Puntos",
      body: `${delta > 0 ? "+" : ""}${delta} pts • ${reason || "Actualización"}`,
      data: { url: "/puntos" },
    };

    let sent = 0;
    let disabled = 0;

    for (const s of subs) {
      try {
        await sendToSubscription(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload
        );
        sent++;
      } catch (e: any) {
        const statusCode = e?.statusCode;

        // ✅ 410 = suscripción muerta → la deshabilitamos
        if (statusCode === 410) {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", s.id);
          disabled++;
        }

        console.error("webpush error:", statusCode, e?.message, e?.body);
      }
    }

    return NextResponse.json({ ok: true, sent, disabled });
  } catch (err) {
    console.error("notify-points fatal:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
