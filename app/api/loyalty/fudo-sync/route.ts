import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";
import {
  applyLoyaltyPointsForFudoSale,
  revokeLoyaltyPointsByRef,
} from "@/lib/loyaltyPointsEngine";
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

// Heurística para detectar “venta eliminada/no existe” según el error del client
function isNotFoundError(msg: string) {
  const s = (msg || "").toLowerCase();
  return s.includes("404") || s.includes("not found") || s.includes("no encontrado");
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
    let revoked = 0;
    let revokedMissing = 0;

    let skippedNotFinal = 0; // no entregado/cancelado
    let skippedNoPhone = 0;
    let skippedNoUser = 0;
    let skippedNoEarnToRevoke = 0;

    let detailErrors = 0;

    const samples: any[] = [];

    // Para “missing detection” guardamos qué saleIds vinieron en el feed actual
    const seenSaleIds = new Set<string>();
    for (const sale of salesArray) {
      if (sale?.id != null) seenSaleIds.add(String(sale.id));
    }

    // 1) Loop principal: aplica (entregado) y revoca (cancelado) para TODO saleType
    for (const sale of salesArray) {
      const attrs = sale.attributes || {};
      const saleId = String(sale.id);
      const saleType = String(attrs.saleType || "UNKNOWN");

      scanned++;

      // Traer detalle para obtener customer/phone/state consistente
      let detail: any;
      try {
        detail = await getFudoSaleDetail(saleId);
      } catch (err: any) {
        detailErrors++;
        const msg = (err as Error).message || "";
        if (msg.includes("429")) break;
        continue;
      }

      const dData = detail?.data;
      const dAttrs = dData?.attributes || {};
      const included = detail?.included || [];

      const anon = dAttrs.anonymousCustomer || null;
      const customerIncluded = included.find((i: any) => i.type === "Customer");

      const phoneRaw: string | null = anon?.phone || customerIncluded?.attributes?.phone || null;
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
      const monto = Number(dAttrs.total ?? attrs.total ?? 0);

      // ✅ Caso 1: ENTREGADO => APPLY
      if (estadoFinal === "entregado") {
        const r = await applyLoyaltyPointsForFudoSale({
          userId,
          saleId,
          amount: monto,
          estadoFinal,
          saleType,
        });

        if ((r as any)?.applied === true) applied++;
        if (samples.length < 8) samples.push({ saleId, saleType, estadoFinal, monto, phoneNorm, result: r });
        continue;
      }

      // ✅ Caso 2: CANCELADO => REVOKE
      if (estadoFinal === "cancelado") {
        const rr = await revokeLoyaltyPointsByRef({
          userId,
          source: "FUDO",
          refType: "order_id",
          refId: `sale:${saleId}`,
          revokedBy: null,
          revokedReason: "order_cancelled",
        });

        if ((rr as any)?.revoked === true) revoked++;
        if ((rr as any)?.reason === "no_earn_found") skippedNoEarnToRevoke++;
        if (samples.length < 8) samples.push({ saleId, saleType, estadoFinal, monto, phoneNorm, result: rr });
        continue;
      }

      // Otros estados
      skippedNotFinal++;
      if (samples.length < 8) samples.push({ saleId, saleType, estadoFinal, monto, phoneNorm, result: "skip_state" });
    }

    // 2) Missing detection (para “BORRAR” que desaparece):
    // Buscamos earns FUDO recientes (sale:<id>) y si ese sale ya NO existe en Fudo => revocamos.
    // OJO: hacemos esto con verificación real via getFudoSaleDetail (no por ausencia en el feed) para no romper.
    const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h

    const { data: earnsRecent, error: earnsErr } = await supabaseAdmin
      .from("loyalty_events")
      .select("user_id, ref_id, created_at")
      .eq("source", "FUDO")
      .eq("event_type", "earn")
      .like("ref_id", "sale:%")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(300);

    if (!earnsErr && Array.isArray(earnsRecent) && earnsRecent.length > 0) {
      for (const ev of earnsRecent) {
        const refId = String((ev as any).ref_id || "");
        const userId = String((ev as any).user_id || "");
        if (!refId.startsWith("sale:") || !userId) continue;

        const saleId = refId.slice("sale:".length).trim();
        if (!saleId) continue;

        // Si está en el feed actual, no tiene sentido checkear missing
        if (seenSaleIds.has(saleId)) continue;

        // Confirmación REAL: pedimos detalle. Si 404/not found => missing => revocar
        try {
          await getFudoSaleDetail(saleId);
          // Existe => no hacemos nada
          continue;
        } catch (err: any) {
          const msg = (err as Error).message || "";
          if (msg.includes("429")) break;

          if (isNotFoundError(msg)) {
            const rr = await revokeLoyaltyPointsByRef({
              userId,
              source: "FUDO",
              refType: "order_id",
              refId: `sale:${saleId}`,
              revokedBy: null,
              revokedReason: "sale_missing_in_fudo",
            });

            if ((rr as any)?.revoked === true) revokedMissing++;
          }

          continue;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scanned,
      applied,
      revoked,
      revoked_missing: revokedMissing,
      skipped_not_final: skippedNotFinal,
      skipped_no_phone: skippedNoPhone,
      skipped_no_user: skippedNoUser,
      skipped_no_earn_to_revoke: skippedNoEarnToRevoke,
      detail_errors: detailErrors,
      samples,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
