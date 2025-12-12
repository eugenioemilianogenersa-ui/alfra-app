// app/api/delivery/assign/route.ts
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

    // 3) Actualizar estado del pedido
    await supabaseAdmin
      .from("orders")
      .update({ estado: "en preparación" })
      .eq("id", orderId);

    return NextResponse.json({
      ok: true,
      repartidor: user.display_name,
      message: "Pedido asignado correctamente",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
