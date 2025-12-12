import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";

// 🔢 Normalizar teléfono de Fudo a un formato común:
function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

// 🧠 Parsear dirección Fudo (string o JSON string tipo ["Calle","123"])
function parseFudoAddress(raw?: string | null): string | null {
  if (!raw) return null;

  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.filter(Boolean).join(" ");
      }
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
  "en camino": 4,
  enviado: 4,
  entregado: 5,
  cancelado: 10, // terminal
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
      // Alineado con botón SALIR del repartidor
      return "enviado";
    case "CLOSED":
      return "entregado";
    case "CANCELED":
      return "cancelado";
    default:
      return "pendiente";
  }
}

export async function GET() {
  console.log("🔄 Iniciando Sync Fudo -> Supabase...");

  const todayStartIso = getTodayStartIso();

  try {
    const fudoResp: any = await getFudoSales();

    const salesArray: any[] = Array.isArray((fudoResp as any).sales)
      ? (fudoResp as any).sales
      : Array.isArray((fudoResp as any).data)
      ? (fudoResp as any).data
      : [];

    let procesadosOrders = 0;
    let ejemploOrder: any = null;

    for (const sale of salesArray) {
      try {
        const attrs = sale.attributes || {};
        const saleId = String(sale.id);

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

          // Si Fudo responde 429 en el detalle, corto el loop para no seguir
          if (msg.includes("429")) {
            console.warn(
              "[FUDO SYNC] Corte anticipado del loop por 429 en sale detail"
            );
            break;
          }

          continue;
        }

        const dData = detail?.data;
        const dAttrs = dData?.attributes || {};
        const included = detail?.included || [];

        console.log("[FUDO SYNC] Venta", saleId, "saleState:", dAttrs.saleState);

        // Cliente (anonymous + Customer incluido)
        const anon = dAttrs.anonymousCustomer || null;
        const customerIncluded = included.find((i: any) => i.type === "Customer");

        const rawName =
          dAttrs.customerName ||
          anon?.name ||
          customerIncluded?.attributes?.name ||
          null;

        const clienteNombre = rawName
          ? String(rawName).trim()
          : `Fudo #${saleId}`;

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

        // Intentar vincular con un usuario de Alfra por phone_normalized
        let userIdForOrder: string | null = null;

        if (fudoPhoneNormalized) {
          const { data: profileMatch, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id, phone_normalized")
            .eq("phone_normalized", fudoPhoneNormalized)
            .maybeSingle();

          if (profileErr) {
            console.error(
              "[FUDO SYNC] Error buscando profile por teléfono:",
              fudoPhoneNormalized,
              profileErr.message
            );
          } else if (profileMatch?.id) {
            userIdForOrder = profileMatch.id;
          }
        }

        // Repartidor Fudo (waiter)
        const waiterRel = dData?.relationships?.waiter?.data;
        const waiterId: string | null = waiterRel?.id
          ? String(waiterRel.id)
          : null;

        // Ver si ya existe el pedido en orders para NO retroceder estado
        const { data: existingOrder, error: existingError } = await supabaseAdmin
          .from("orders")
          .select("id, estado, user_id")
          .eq("external_id", saleId)
          .maybeSingle();

        if (existingError) {
          console.error(
            "[FUDO SYNC] Error leyendo order existente:",
            saleId,
            existingError.message
          );
        }

        let finalEstado = estadoDesdeFudo;
        const estadoActual = existingOrder?.estado as string | undefined;

        if (estadoActual) {
          const rankActual = ESTADO_RANK[estadoActual] ?? 0;
          const rankNuevo = ESTADO_RANK[estadoDesdeFudo] ?? 0;

          // Si el nuevo estado es "más atrás", mantenemos el actual
          if (rankNuevo < rankActual) {
            finalEstado = estadoActual;
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
        };

        if (finalUserId) {
          payload.user_id = finalUserId;
        }

        const { data: upsertedOrder, error: upsertError } = await supabaseAdmin
          .from("orders")
          .upsert(payload, { onConflict: "external_id" })
          .select()
          .single();

        if (upsertError || !upsertedOrder) {
          console.error("❌ Error upsert orders:", upsertError?.message);
          continue;
        }

        procesadosOrders++;
        if (!ejemploOrder) ejemploOrder = upsertedOrder;

        // AUTO-ASIGNAR DELIVERY SEGÚN WAITER DE FUDO
        if (waiterId) {
          try {
            const { data: waiterMap, error: waiterMapError } = await supabaseAdmin
              .from("fudo_waiter_map")
              .select("delivery_user_id")
              .eq("waiter_id_fudo", waiterId)
              .maybeSingle();

            if (waiterMapError) {
              console.error(
                "[FUDO SYNC] Error leyendo fudo_waiter_map:",
                waiterId,
                waiterMapError.message
              );
            }

            if (waiterMap?.delivery_user_id) {
              const { data: existingDelivery, error: existingDeliveryError } =
                await supabaseAdmin
                  .from("deliveries")
                  .select("id")
                  .eq("order_id", upsertedOrder.id)
                  .maybeSingle();

              if (existingDeliveryError) {
                console.error(
                  "[FUDO SYNC] Error consultando deliveries:",
                  upsertedOrder.id,
                  existingDeliveryError.message
                );
              }

              if (!existingDeliveryError && !existingDelivery) {
                const { error: insertDeliveryError } = await supabaseAdmin
                  .from("deliveries")
                  .insert({
                    order_id: upsertedOrder.id,
                    delivery_user_id: waiterMap.delivery_user_id,
                    status: "asignado",
                  });

                if (insertDeliveryError) {
                  console.error(
                    "[FUDO SYNC] Error insertando deliveries:",
                    upsertedOrder.id,
                    insertDeliveryError.message
                  );
                } else {
                  console.log(
                    "[FUDO SYNC] Delivery auto-asignado desde Fudo:",
                    "order",
                    upsertedOrder.id,
                    "→ user",
                    waiterMap.delivery_user_id
                  );
                }
              }
            }
          } catch (e) {
            console.error("⚠️ Error auto-asignando delivery:", e);
          }
        }
      } catch (err) {
        console.error("❌ Error procesando sale:", err);
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
    console.error("[FUDO SYNC] Error general:", msg);

    // Si es un 429 desde getFudoSales, devolvemos 429 también
    const status = msg.includes("429") ? 429 : 500;

    return NextResponse.json(
      { ok: false, error: msg },
      { status }
    );
  }
}
