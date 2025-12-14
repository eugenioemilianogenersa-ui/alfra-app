import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function parseFudoAddress(raw?: string | null): string | null {
  if (!raw) return null;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(Boolean).join(" ");
    } catch {
      return raw;
    }
  }
  return raw;
}

function getTodayStartIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00Z`;
}

const ESTADO_RANK: Record<string, number> = {
  pendiente: 1,
  "en preparación": 2,
  "listo para entregar": 3,
  enviado: 4,
  entregado: 5,
  cancelado: 10,
};

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

async function logSync(params: {
  sale_id?: string | null;
  order_id?: number | null;
  action: string;
  old_estado?: string | null;
  new_estado?: string | null;
  final_estado?: string | null;
  note?: string | null;
}) {
  try {
    await supabaseAdmin.from("fudo_sync_logs").insert({
      sale_id: params.sale_id ?? null,
      order_id: params.order_id ?? null,
      action: params.action,
      old_estado: params.old_estado ?? null,
      new_estado: params.new_estado ?? null,
      final_estado: params.final_estado ?? null,
      note: params.note ?? null,
    });
  } catch {
    // no rompemos el sync por logging
  }
}

export async function GET() {
  const todayStartIso = getTodayStartIso();

  try {
    const fudoResp: any = await getFudoSales();

    const salesArray: any[] = Array.isArray(fudoResp?.sales)
      ? fudoResp.sales
      : Array.isArray(fudoResp?.data)
      ? fudoResp.data
      : [];

    let procesadosOrders = 0;
    let ejemploOrder: any = null;

    for (const sale of salesArray) {
      const attrs = sale.attributes || {};
      const saleId = String(sale.id);

      try {
        if (attrs.saleType !== "DELIVERY") continue;
        if (!attrs.createdAt) continue;
        if (attrs.createdAt < todayStartIso) continue;

        let detail: any;
        try {
          detail = await getFudoSaleDetail(saleId);
        } catch (err: any) {
          const msg = (err as Error).message || "";
          await logSync({
            sale_id: saleId,
            action: "ERROR_DETAIL",
            note: msg,
          });

          if (msg.includes("429")) break;
          continue;
        }

        const dData = detail?.data;
        const dAttrs = dData?.attributes || {};
        const included = detail?.included || [];

        const anon = dAttrs.anonymousCustomer || null;
        const customerIncluded = included.find((i: any) => i.type === "Customer");

        const rawName =
          dAttrs.customerName ||
          anon?.name ||
          customerIncluded?.attributes?.name ||
          null;

        const clienteNombre = rawName ? String(rawName).trim() : `Fudo #${saleId}`;

        const direccionEntrega =
          parseFudoAddress(anon?.address) ||
          parseFudoAddress(customerIncluded?.attributes?.address) ||
          null;

        const monto = dAttrs.total ?? attrs.total ?? 0;

        const estadoDesdeFudo = mapSaleStateToEstado(dAttrs.saleState);

        const fudoPhoneRaw: string | null =
          anon?.phone || customerIncluded?.attributes?.phone || null;

        const fudoPhoneNormalized = normalizePhone(fudoPhoneRaw);

        let userIdForOrder: string | null = null;
        if (fudoPhoneNormalized) {
          const { data: profileMatch } = await supabaseAdmin
            .from("profiles")
            .select("id, phone_normalized")
            .eq("phone_normalized", fudoPhoneNormalized)
            .maybeSingle();

          if (profileMatch?.id) userIdForOrder = profileMatch.id;
        }

        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id, estado, user_id, estado_updated_at, estado_source")
          .eq("external_id", saleId)
          .maybeSingle();

        let finalEstado = estadoDesdeFudo;

        // Anti-regresión por timestamp + rank
        if (existingOrder?.estado) {
          const oldEstado = String(existingOrder.estado);
          const oldRank = ESTADO_RANK[oldEstado] ?? 0;
          const newRank = ESTADO_RANK[estadoDesdeFudo] ?? 0;

          if (newRank < oldRank) {
            finalEstado = oldEstado;

            await logSync({
              sale_id: saleId,
              order_id: existingOrder.id,
              action: "SKIP_REGRESSION",
              old_estado: oldEstado,
              new_estado: estadoDesdeFudo,
              final_estado: finalEstado,
              note: `estado_source=${existingOrder.estado_source ?? "null"}`,
            });
          }
        }

        const finalUserId = userIdForOrder || existingOrder?.user_id || null;

        const payload: any = {
          cliente_nombre: clienteNombre,
          direccion_entrega: direccionEntrega,
          monto,
          estado: finalEstado,
          creado_en: attrs.createdAt,
          fudo_id: saleId,
          source: "FUDO",
          external_id: saleId,
          estado_source: "FUDO",
        };

        if (finalUserId) payload.user_id = finalUserId;

        const { data: upsertedOrder, error: upsertError } = await supabaseAdmin
          .from("orders")
          .upsert(payload, { onConflict: "external_id" })
          .select()
          .single();

        if (upsertError || !upsertedOrder) {
          await logSync({
            sale_id: saleId,
            action: "ERROR_UPSERT",
            old_estado: existingOrder?.estado ?? null,
            new_estado: estadoDesdeFudo,
            final_estado: finalEstado,
            note: upsertError?.message ?? "unknown",
          });
          continue;
        }

        procesadosOrders++;
        if (!ejemploOrder) ejemploOrder = upsertedOrder;

        await logSync({
          sale_id: saleId,
          order_id: upsertedOrder.id,
          action: "UPSERT_ORDER",
          old_estado: existingOrder?.estado ?? null,
          new_estado: estadoDesdeFudo,
          final_estado: finalEstado,
          note: "ok",
        });

      } catch (err: any) {
        await logSync({
          sale_id: saleId,
          action: "ERROR_LOOP",
          note: err?.message ?? "unknown",
        });
        continue;
      }
    }

    return NextResponse.json({
      ok: true,
      mensaje: "sync Fudo OK",
      procesados_orders: procesadosOrders,
      ejemplo_order: ejemploOrder,
    });
  } catch (err: any) {
    const msg = (err as Error).message || "Error desconocido";
    const status = msg.includes("429") ? 429 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
