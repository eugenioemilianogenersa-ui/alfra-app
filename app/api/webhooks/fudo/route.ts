import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1️⃣ Validar secret por query param
    const url = new URL(req.url);
    const incomingSecret = url.searchParams.get("secret");
    const expectedSecret = process.env.FUDO_WEBHOOK_SECRET;

    if (!expectedSecret || incomingSecret !== expectedSecret) {
      console.error("FUDO_WEBHOOK_INVALID_SECRET");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 2️⃣ Leer SIEMPRE como texto (Fudo no siempre manda JSON)
    const rawBody = await req.text();

    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }

    console.log("FUDO_WEBHOOK_PAYLOAD:", payload);

    // 3️⃣ Extraer ID del pedido (probamos varias claves posibles)
    const orderId =
      payload?.order_id ||
      payload?.pedido_id ||
      payload?.id ||
      payload?.order?.id ||
      null;

    if (!orderId) {
      console.warn("FUDO_WEBHOOK_NO_ORDER_ID");
      return NextResponse.json({ ok: true });
    }

    // 4️⃣ Disparar sync puntual (REUTILIZA lo que ya funciona)
    // Llamamos internamente a tu endpoint existente /api/fudo/sync
    const syncUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/fudo/sync?id=${orderId}`;

    fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    }).catch((err) => {
      console.error("FUDO_WEBHOOK_SYNC_ERROR", err);
    });

    // 5️⃣ Responder rápido a Fudo
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("FUDO_WEBHOOK_FATAL_ERROR", e?.message || e);
    return NextResponse.json({ ok: true });
  }
}
