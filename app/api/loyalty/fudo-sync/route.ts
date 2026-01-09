import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";
import { applyLoyaltyPointsForFudoSale } from "@/lib/loyaltyPointsEngine";
import { requireCronAuthIfPresent } from "@/lib/cronAuth";

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function mapSaleStateToEstado(saleState?: string | null): string {
  if (!saleState) return "pendiente";
  switch (saleState) {
    case "IN-COURSE":
      return "en preparación";
    case "READY-TO-DELIVER":
    case "DELIVERY-READY-TO-DELIVER":
      return "listo para entregar";
    case "DELIVERY-SENT":
      return "enviado";
    case "CLOSED":
      return "entregado";
    case "CANCELED":
      return "cancelado";
    default:
      return "pendiente";
  }
}

export async function GET(req: Request) {
  const denied = requireCronAuthIfPresent(req);
  if (denied) return denied;

  try {
    // lote moderado para no comer 429
    const fudoResp: any = await getFudoSales(80);

    const salesArray: any[] = Array.isArray(fudoResp?.sales)
      ? fudoResp.sales
      : Array.isArray(fudoResp?.data)
        ? fudoResp.data
        : [];

    let scanned = 0;
    let applied = 0;
    let skippedNotClosed = 0;
    let skippedNoPhone = 0;
    let skippedNoUser = 0;
    const samples: any[] = [];

    for (const sale of salesArray) {
      const attrs = sale.attributes || {};
      const saleId = String(sale.id);
      const saleType = String(attrs.saleType || "UNKNOWN");

      scanned++;

      // Traer detalle para obtener customer/phone de forma consistente
      let detail: any;
      try {
        detail = await getFudoSaleDetail(saleId);
      } catch (err: any) {
        const msg = (err as Error).message || "";
        if (msg.includes("429")) break;
        continue;
      }

      const dData = detail?.data;
      const dAttrs = dData?.attributes || {};
      const included = detail?.included || [];

      const anon = dAttrs.anonymousCustomer || null;
      const customerIncluded = included.find((i: any) => i.type === "Customer");

      const phoneRaw: string | null =
        anon?.phone || customerIncluded?.attributes?.phone || null;

      const phoneNorm = normalizePhone(phoneRaw);
      if (!phoneNorm) {
        skippedNoPhone++;
        continue;
      }

      const { data: profileMatch } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone_normalized", phoneNorm)
        .maybeSingle();

      const userId = profileMatch?.id ? String(profileMatch.id) : null;
      if (!userId) {
        skippedNoUser++;
        continue;
      }

      const estadoFinal = mapSaleStateToEstado(dAttrs.saleState || attrs.saleState);
      if (estadoFinal !== "entregado") {
        skippedNotClosed++;
        continue;
      }

      const monto = Number(dAttrs.total ?? attrs.total ?? 0);

      const r = await applyLoyaltyPointsForFudoSale({
        userId,
        saleId,
        amount: monto,
        estadoFinal,
        saleType,
      });

      if ((r as any)?.applied === true) applied++;
      if (samples.length < 8) samples.push({ saleId, saleType, estadoFinal, monto, phoneNorm, result: r });
    }

    return NextResponse.json({
      ok: true,
      scanned,
      applied,
      skipped_not_closed: skippedNotClosed,
      skipped_no_phone: skippedNoPhone,
      skipped_no_user: skippedNoUser,
      samples,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
