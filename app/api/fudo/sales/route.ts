// app/api/fudo/sync/route.ts
import { NextResponse } from "next/server";
import { getFudoSales } from "@/lib/fudoClient";
import { createClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    console.log("🔄 Sync Fudo -> Supabase...");

    const fudoData = await getFudoSales(50);
    const sales = fudoData?.data || [];

    if (sales.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay ventas para sincronizar.",
      });
    }

    const ordersToUpsert = sales.map((sale: any) => {
      const attr = sale.attributes || {};
      return {
        fudo_id: sale.id,
        created_at_fudo: attr.createdAt || null,
        closed_at_fudo: attr.closedAt || null,
        total: attr.total ?? 0,
        sale_type: attr.saleType || "UNKNOWN",
        sale_state: attr.saleState || "UNKNOWN",
        synced_at: new Date().toISOString(),
      };
    });

    const supabase = createClient();

    const { error } = await supabase
      .from("fudo_orders")
      .upsert(ordersToUpsert, {
        onConflict: "fudo_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("❌ Error Supabase:", error);
      throw new Error(`Error Supabase: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Sincronización Exitosa",
      procesados: ordersToUpsert.length,
      ejemplo: ordersToUpsert[0],
    });
  } catch (err: any) {
    console.error("❌ Error en Sync:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error desconocido en sync" },
      { status: 500 }
    );
  }
}
