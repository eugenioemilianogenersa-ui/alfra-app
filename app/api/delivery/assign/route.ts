import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { orderId, deliveryUserId } = await req.json();

    if (!orderId || !deliveryUserId) {
      return NextResponse.json(
        { ok: false, error: "Faltan parámetros" },
        { status: 400 }
      );
    }

    // 0) Leer asignación previa para evitar spam si no cambió
    const { data: prevDelivery, error: prevErr } = await supabaseAdmin
      .from("deliveries")
      .select("delivery_user_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (prevErr) {
      return NextResponse.json(
        { ok: false, error: prevErr.message },
        { status: 500 }
      );
    }

    const prevDeliveryUserId = (prevDelivery?.delivery_user_id ?? null) as
      | string
      | null;

    // 1) Validar que el usuario exista y sea repartidor
    const { data: user, error: userErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", deliveryUserId)
      .single();

    if (userErr || !user || user.role !== "delivery") {
      return NextResponse.json(
        { ok: false, error: "Repartidor no válido" },
        { status: 400 }
      );
    }

    // 2) Crear / actualizar asignación en deliveries
    const { error: upsertErr } = await supabaseAdmin
      .from("deliveries")
      .upsert(
        {
          order_id: orderId,
          delivery_user_id: deliveryUserId,
          status: "asignado",
        },
        { onConflict: "order_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { ok: false, error: upsertErr.message },
        { status: 500 }
      );
    }

    // 3) Actualizar estado del pedido (no tocamos estado_source para no romper tu lógica)
    await supabaseAdmin
      .from("orders")
      .update({ estado: "en preparación" })
      .eq("id", orderId);

    // 4) PUSH al delivery SOLO si es nueva asignación o cambió el repartidor
    const shouldNotify = !prevDeliveryUserId || prevDeliveryUserId !== deliveryUserId;

    if (shouldNotify) {
      const origin = req.headers.get("origin") || "https://alfra-app.vercel.app";
      const base = process.env.NEXT_PUBLIC_SITE_URL || origin;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.INTERNAL_PUSH_KEY) {
        headers["x-internal-key"] = process.env.INTERNAL_PUSH_KEY;
      }

      await fetch(`${base}/api/push/notify-delivery-assigned`, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderId }),
      });
    }

    return NextResponse.json({
      ok: true,
      repartidor: user.display_name,
      message: "Pedido asignado correctamente",
      notified: shouldNotify,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
