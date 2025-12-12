// app/api/fudo/mirror-today/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("active_fudo_orders_today")
      .select("*")
      .order("created_at_fudo", { ascending: true });

    if (error) {
      console.error("[FUDO MIRROR TODAY] Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: data?.length ?? 0,
      orders: data ?? [],
    });
  } catch (err: any) {
    console.error("[FUDO MIRROR TODAY] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
