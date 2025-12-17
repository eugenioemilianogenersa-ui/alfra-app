import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";

// 🔢 Normalizar teléfono de Fudo a un formato común:
function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

// 🧠 Parsear dirección Fudo (string o JSON string tipo ["Calle","123"])
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

// Inicio de día (UTC) para traer solo ventas de hoy
function getTodayStartIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00Z`;
}

// Ranking de estados para NO retroceder
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

// --- Logging (no rompe el sync si falla) ---
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
    // noop
  }
}

export async function GET() {
  console.log("🔄 Iniciando Sync Fudo -> Supabase...");
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
        // Solo DELIVERY del día
        if (attrs.saleType !== "DELIVERY") continue;
        if (!attrs.createdAt) continue;
        if (attrs.createdAt < todayStartIso) continue;

        // Detalle de venta
        let detail: any;
        try {
          detail = await getFudoSaleDetail(saleId);
        } catch (err: any) {
          const msg = (err as Error).message || "";
          console.error("❌ Error sale detail:", msg);

          await logSync({ sale_id: saleId, action: "ERROR_DETAIL", note: msg });

          if (msg.includes("429")) {
            console.warn("[FUDO SYNC] Corte anticipado del loop por 429 en sale detail");
            break;
          }
          continue;
        }

        const dData = detail?.data;
        const dAttrs = dData?.attributes || {};
        const included = detail?.included || [];

        // Cliente (anonymous + Customer incluido)
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

        // Estado según Fudo
        const estadoDesdeFudo = mapSaleStateToEstado(dAttrs.saleState);

        // Teléfono del cliente Fudo (anonymous o Customer)
        const fudoPhoneRaw: string | null =
          anon?.phone || customerIncluded?.attributes?.phone || null;

        const fudoPhoneNormalized = normalizePhone(fudoPhoneRaw);

        // Repartidor Fudo (waiter)
        const waiterRel = dData?.relationships?.waiter?.data;
        const waiterId: string | null = waiterRel?.id ? String(waiterRel.id) : null;

        // Leer pedido existente para NO retroceder estado
        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id, estado, user_id")
          .eq("external_id", saleId)
          .maybeSingle();

        // NO rollback
        let finalEstado = estadoDesdeFudo;
        const estadoActual = existingOrder?.estado as string | undefined;

        if (estadoActual) {
          const rankActual = ESTADO_RANK[estadoActual] ?? 0;
          const rankNuevo = ESTADO_RANK[estadoDesdeFudo] ?? 0;
          if (rankNuevo < rankActual) {
            finalEstado = estadoActual;
            await logSync({
              sale_id: saleId,
              order_id: existingOrder?.id ?? null,
              action: "SKIP_REGRESSION",
              old_estado: estadoActual,
              new_estado: estadoDesdeFudo,
              final_estado: finalEstado,
              note: "rank regression prevented",
            });
          }
        }

        // Vincular con usuario por phone_normalized
        let userIdForOrder: string | null = null;
        if (fudoPhoneNormalized) {
          const { data: profileMatch, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id, phone_normalized")
            .eq("phone_normalized", fudoPhoneNormalized)
            .maybeSingle();

          if (profileErr) {
            console.error("[FUDO SYNC] Error buscando profile por teléfono:", profileErr.message);
          } else if (profileMatch?.id) {
            userIdForOrder = profileMatch.id;
          }
        }

        // Mantener user_id existente si esta corrida no lo encontró
        const finalUserId = userIdForOrder || existingOrder?.user_id || null;

        // Payload de upsert
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
          cliente_phone_normalized: fudoPhoneNormalized,
        };

        if (finalUserId) payload.user_id = finalUserId;

        const { data: upsertedOrder, error: upsertError } = await supabaseAdmin
          .from("orders")
          .upsert(payload, { onConflict: "external_id" })
          .select()
          .single();

        if (upsertError || !upsertedOrder) {
          console.error("❌ Error upsert orders:", upsertError?.message);
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
          note: `ok phone=${fudoPhoneNormalized ?? "null"} user_id=${finalUserId ?? "null"}`,
        });

        // PUSH por cambio real
        const prevEstado = (existingOrder?.estado ?? null) as string | null;

        if (
          prevEstado !== finalEstado &&
          ["en preparación", "listo para entregar", "enviado", "entregado", "cancelado"].includes(finalEstado)
        ) {
          try {
            const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";
            await fetch(`${base}/api/push/notify-order-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: upsertedOrder.id, estado: finalEstado }),
            });
            await logSync({
              sale_id: saleId,
              order_id: upsertedOrder.id,
              action: "PUSH_ORDER_STATUS",
              old_estado: prevEstado,
              new_estado: estadoDesdeFudo,
              final_estado: finalEstado,
              note: "push queued",
            });
          } catch (e: any) {
            await logSync({
              sale_id: saleId,
              order_id: upsertedOrder.id,
              action: "ERROR_PUSH_ORDER_STATUS",
              old_estado: prevEstado,
              new_estado: estadoDesdeFudo,
              final_estado: finalEstado,
              note: e?.message || "push error",
            });
          }
        }

        // AUTO-ASIGNAR DELIVERY (waiter -> delivery_user_id)
        if (waiterId) {
          try {
            const { data: waiterMap } = await supabaseAdmin
              .from("fudo_waiter_map")
              .select("delivery_user_id")
              .eq("waiter_id_fudo", waiterId)
              .maybeSingle();

            if (waiterMap?.delivery_user_id) {
              const { data: existingDelivery } = await supabaseAdmin
                .from("deliveries")
                .select("id")
                .eq("order_id", upsertedOrder.id)
                .maybeSingle();

              if (!existingDelivery) {
                const { error: insertDeliveryError } = await supabaseAdmin
                  .from("deliveries")
                  .insert({
                    order_id: upsertedOrder.id,
                    delivery_user_id: waiterMap.delivery_user_id,
                    status: "asignado",
                  });

                if (insertDeliveryError) {
                  await logSync({
                    sale_id: saleId,
                    order_id: upsertedOrder.id,
                    action: "ERROR_AUTO_ASSIGN",
                    note: insertDeliveryError.message,
                  });
                } else {
                  await logSync({
                    sale_id: saleId,
                    order_id: upsertedOrder.id,
                    action: "AUTO_ASSIGN",
                    note: `waiter=${waiterId} user=${waiterMap.delivery_user_id}`,
                  });

                  // PUSH al delivery
                  try {
                    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://alfra-app.vercel.app";
                    const headers: Record<string, string> = { "Content-Type": "application/json" };
                    if (process.env.INTERNAL_PUSH_KEY) headers["x-internal-key"] = process.env.INTERNAL_PUSH_KEY;

                    await fetch(`${base}/api/push/notify-delivery-assigned`, {
                      method: "POST",
                      headers,
                      body: JSON.stringify({ orderId: upsertedOrder.id }),
                    });

                    await logSync({
                      sale_id: saleId,
                      order_id: upsertedOrder.id,
                      action: "PUSH_DELIVERY_ASSIGNED",
                      note: `delivery_user_id=${waiterMap.delivery_user_id}`,
                    });
                  } catch (e: any) {
                    await logSync({
                      sale_id: saleId,
                      order_id: upsertedOrder.id,
                      action: "ERROR_PUSH_DELIVERY_ASSIGNED",
                      note: e?.message || "push error",
                    });
                  }
                }
              }
            }
          } catch (e: any) {
            await logSync({
              sale_id: saleId,
              order_id: upsertedOrder.id,
              action: "ERROR_AUTO_ASSIGN",
              note: e?.message || "unknown",
            });
          }
        }
      } catch (err: any) {
        await logSync({ sale_id: saleId, action: "ERROR_LOOP", note: err?.message || "unknown" });
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
