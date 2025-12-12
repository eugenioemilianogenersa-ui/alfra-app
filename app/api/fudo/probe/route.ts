// app/api/fudo/probe/route.ts
import { NextResponse } from "next/server";
import { getFudoSaleDetail, getFudoCustomer } from "@/lib/fudoClient";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saleId = searchParams.get("saleId");

    if (!saleId) {
      return NextResponse.json(
        { ok: false, error: "Falta el parámetro saleId" },
        { status: 400 }
      );
    }

    console.log("🔍 PROBE FUDO saleId =", saleId);

    // Detalle de la venta con included
    const saleDetail = await getFudoSaleDetail(saleId);

    // Customer relacionado
    const relCustomer =
      saleDetail?.data?.relationships?.customer?.data || null;

    let customerDetail: any = null;
    if (relCustomer?.id) {
      customerDetail = await getFudoCustomer(relCustomer.id);
    }

    console.log("--- 🔔 FUDO SALE DETAIL RAW ---");
    console.log(JSON.stringify(saleDetail, null, 2));

    if (customerDetail) {
      console.log("--- 👤 FUDO CUSTOMER RAW ---");
      console.log(JSON.stringify(customerDetail, null, 2));
    }

    return NextResponse.json({
      ok: true,
      saleId,
      saleDetail,
      customerDetail,
      customerRel: relCustomer,
    });
  } catch (error: any) {
    console.error("Error en /api/fudo/probe:", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
