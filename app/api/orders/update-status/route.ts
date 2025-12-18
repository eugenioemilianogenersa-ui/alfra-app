import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { orderId, estado, source } = await req.json();

    if (!orderId || !estado) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        estado,
        estado_source: source ?? "API",
      })
      .eq("id", orderId);

    if (error) {
      console.error("update-status error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("update-status fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
  