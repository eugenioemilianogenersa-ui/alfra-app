import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  try {
    const { userId, silent } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    // ✅ silent = no push (cancelaciones / revokes)
    if (silent === true) {
      return NextResponse.json({ ok: true, sent: 0, disabled: 0, note: "silent" });
    }

    initWebPush();

    // Wallet actual para armar el mensaje
    const { data: w, error: wErr } = await supabaseAdmin
      .from("stamps_wallet")
      .select("current_stamps")
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) {
      console.error("stamps_wallet select error:", wErr);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const current = Number(w?.current_stamps ?? 0);

    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,enabled")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (error) {
      console.error("push_subscriptions select error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    console.log("subs found:", subs?.length ?? 0, "userId:", userId, "stamps:", current);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "no subs" });
    }

    const title =
      current >= 8 ? "AlFra – ¡Premio desbloqueado! 🎁" : "AlFra – Sumaste 1 sello 🍺";

    const body =
      current >= 8
        ? "Ya tenés 8/8 sellos. Entrá al dashboard para canjear."
        : `Llevás ${current}/8 sellos. ¡Seguí sumando!`;

    const payload = {
      title,
      body,
      data: { url: "/dashboard" },
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

    return NextResponse.json({ ok: true, sent, disabled, stamps: current });
  } catch (err) {
    console.error("notify-stamps fatal:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
