// C:\Dev\alfra-app\app\api\delivery\assign\route.ts
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

    // 1) Validar que el usuario exista y sea repartidor + armar nombre
    const { data: user, error: userErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, role")
      .eq("id", deliveryUserId)
      .single();

    if (userErr || !user || user.role !== "delivery") {
      return NextResponse.json(
        { ok: false, error: "Repartidor no válido" },
        { status: 400 }
      );
    }

    const deliveryNombre =
      user.display_name ||
      (user.email ? user.email.split("@")[0] : null) ||
      "Repartidor";

    // 2) Guardar en ORDERS (DENORMALIZADO) -> para que STAFF lo vea sin joins/RLS
    //    IMPORTANTÍSIMO: NO TOCAR estado acá.
    const { error: orderUpdErr } = await supabaseAdmin
      .from("orders")
      .update({
        delivery_user_id: deliveryUserId,
        delivery_nombre: deliveryNombre,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (orderUpdErr) {
      return NextResponse.json(
        { ok: false, error: orderUpdErr.message },
        { status: 500 }
      );
    }

    // 3) Crear / actualizar asignación en DELIVERIES (si la seguís usando)
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

    // 4) PUSH al delivery SOLO si es nueva asignación o cambió el repartidor
    const shouldNotify = !prevDeliveryUserId || prevDeliveryUserId !== deliveryUserId;

    if (shouldNotify) {
      // base dinámico (dominio actual). No usar origin header ni hardcodear.
      const base = new URL(req.url).origin;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.INTERNAL_PUSH_KEY) {
        headers["x-internal-key"] = process.env.INTERNAL_PUSH_KEY;
      }

      // No romper la asignación si el push falla
      try {
        await fetch(`${base}/api/push/notify-delivery-assigned`, {
          method: "POST",
          headers,
          cache: "no-store",
          body: JSON.stringify({ orderId }),
        });
      } catch {
        // silencioso a propósito
      }
    }

    return NextResponse.json({
      ok: true,
      repartidor: deliveryNombre,
      message: "Pedido asignado correctamente",
      notified: shouldNotify,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}
