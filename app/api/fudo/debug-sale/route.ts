import { NextResponse } from "next/server";
import { getFudoSaleDetail } from "@/lib/fudoClient";

// GET /api/fudo/debug-sale?id=18464
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Falta ?id=SALE_ID" },
      { status: 400 }
    );
  }

  try {
    const detail = await getFudoSaleDetail(String(id));

    console.log("🔎 FUDO DEBUG SALE DETAIL", id);
    console.log(JSON.stringify(detail, null, 2));

    return NextResponse.json({ ok: true, raw: detail });
  } catch (e: any) {
    console.error("Error debug-sale:", e);
    return NextResponse.json(
      { ok: false, error: e.message || "Error llamando a Fudo" },
      { status: 500 }
    );
  }
}
