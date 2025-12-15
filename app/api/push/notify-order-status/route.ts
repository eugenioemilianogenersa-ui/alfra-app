import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

const NOTIFIABLE = new Set([
  "listo para entregar",
  "enviado",
  "entregado",
  "cancelado",
]);

export async function POST(req: Request) {
  try {
    const { orderId, estado } = await req.json();

    if (!orderId || !estado) {
      return NextResponse.json(
        { error: "orderId y estado requeridos" },
        { status: 400 }
      );
    }

    if (!NOTIFIABLE.has(estado)) {
      return NextResponse.json({ ok: true, skipped: "estado_not_notifiable" });
    }

    // 1) Buscar pedido + user_id
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, cliente_nombre")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    if (!order?.user_id)
      return NextResponse.json({ ok: true, skipped: "no_user_id" });

    const userId = order.user_id as string;

    // 2) Anti-duplicados (orderId+estado)
    const key = `order:${orderId}:${estado}`;

    const { data: already } = await supabaseAdmin
      .from("notifications_log")
      .select("id")
      .eq("topic", key)
      .eq("user_id", userId)
      .limit(1);

    if (already && already.length > 0) {
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }

    // 3) Subs activas
    const { data: subs, error: sErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!subs || subs.length === 0)
      return NextResponse.json({ ok: true, skipped: "no_subs" });

    // 4) Payload bonito
    const title = "AlFra – Pedido";

    const body =
      estado === "listo para entregar"
        ? "📦✨ ¡Tu pedido ya está listo! En breve sale 🚀"
        : estado === "enviado"
        ? "🛵💨 ¡Tu pedido salió para entrega! Ya va en camino 🍺"
        : estado === "entregado"
        ? "✅🍻 ¡Pedido entregado! Gracias por elegir AlFra 🙌"
        : "❌ Tu pedido fue cancelado.";

    const payload = {
      title,
      body,
      data: { url: `/cliente/pedido/${orderId}` },
    };

    initWebPush();

    // 5) Log ANTES (corta duplicados por concurrencia)
    await supabaseAdmin.from("notifications_log").insert({
      user_id: userId,
      topic: key,
      title,
      body,
      data: { orderId, estado },
      status: "queued",
    });

    // 6) Enviar + deshabilitar 410
    let sent = 0;
    let disabled = 0;

    for (const s of subs) {
      const res = await sendToSubscription(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload
      );

      if (res.ok) {
        sent++;
      } else if (res.statusCode === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", s.id);
        disabled++;
      }
    }

    await supabaseAdmin
      .from("notifications_log")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("topic", key)
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, sent, disabled });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
