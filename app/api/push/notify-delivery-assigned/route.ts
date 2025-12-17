import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

const NOTIFIABLE_STATES = new Set([
  "pendiente",
  "en preparación",
  "listo para entregar",
]);

export async function POST(req: Request) {
  try {
    // (Opcional) si configurás INTERNAL_PUSH_KEY, lo exigimos
    const internalKey = process.env.INTERNAL_PUSH_KEY;
    if (internalKey) {
      const got = req.headers.get("x-internal-key");
      if (got !== internalKey) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const orderId = body.orderId as number | undefined;

    if (!orderId) {
      return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
    }

    // 1) Buscar delivery asignado para ese pedido
    const { data: delRow, error: dErr } = await supabaseAdmin
      .from("deliveries")
      .select("id, order_id, delivery_user_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    if (!delRow?.delivery_user_id) {
      return NextResponse.json({ ok: true, skipped: "no_delivery_assigned" });
    }

    const deliveryUserId = delRow.delivery_user_id as string;

    // 2) Chequear estado del pedido (si ya está cerrado, no avisar)
    const { data: ord, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, estado")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    const estado = (ord?.estado ?? null) as string | null;

    if (!estado || !NOTIFIABLE_STATES.has(estado)) {
      return NextResponse.json({ ok: true, skipped: "estado_not_notifiable", estado });
    }

    // 3) Dedupe por pedido+repartidor
    const topic = `delivery:assigned:${orderId}:${deliveryUserId}`;

    const { data: already } = await supabaseAdmin
      .from("notifications_log")
      .select("id")
      .eq("topic", topic)
      .eq("user_id", deliveryUserId)
      .limit(1);

    if (already && already.length > 0) {
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }

    // 4) Buscar subs del delivery
    const { data: subs, error: sErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", deliveryUserId)
      .eq("enabled", true);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_subs" });
    }

    initWebPush();

    const title = "AlFra – Delivery";
    const msg = "🛵 Ingresó un nuevo pedido para llevar.";

    const payload = {
      title,
      body: msg,
      data: { url: "/delivery" },
    };

    // Log queued
    await supabaseAdmin.from("notifications_log").insert({
      user_id: deliveryUserId,
      topic,
      title,
      body: msg,
      data: { orderId },
      status: "queued",
    });

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
      .update({
        status: sent > 0 ? "sent" : "error",
        sent_at: new Date().toISOString(),
        error: sent > 0 ? null : "No subscription delivered",
      })
      .eq("topic", topic)
      .eq("user_id", deliveryUserId);

    return NextResponse.json({ ok: true, sent, disabled, deliveryUserId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
