// C:\Dev\alfra-app\app\api\stamps\fudo-sync\route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFudoSales, getFudoSaleDetail } from "@/lib/fudoClient";
import { applyStamp, revokeStampByRef, getStampConfig } from "@/lib/stampsEngine";
import { requireCronAuthIfPresent } from "@/lib/cronAuth";

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function getTodayStartIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00Z`;
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

async function logSync(params: { sale_id?: string | null; action: string; note?: string | null }) {
  try {
    await supabaseAdmin.from("fudo_sync_logs").insert({
      sale_id: params.sale_id ?? null,
      action: params.action,
      note: params.note ?? null,
    });
  } catch {
    // noop
  }
}

export async function GET(req: Request) {
  // ✅ si viene cron_secret => auth pro (cron_secret + bearer opcional)
  const denied = requireCronAuthIfPresent(req);
  if (denied) return denied;

  // ✅ modo manual (dev/legacy) se mantiene
  const requiredKey = process.env.INTERNAL_STAMPS_SYNC_KEY;
  if (requiredKey) {
    const key = new URL(req.url).searchParams.get("key") || "";
    if (key !== requiredKey) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  // ✅ base dinámico (dominio actual)
  const base = new URL(req.url).origin;

  console.log("🧷 [STAMPS] Fudo Sync Sellos (mesa/mostrador/delivery)...");
  const todayStartIso = getTodayStartIso();

  let stampCfg: any = null;
  try {
    stampCfg = await getStampConfig();
  } catch {
    stampCfg = null;
  }

  if (!stampCfg?.enabled) {
    return NextResponse.json({ ok: true, note: "stamps disabled" });
  }

  const grantOn = String(stampCfg?.grant_on_estado || "entregado");

  try {
    const fudoResp: any = await getFudoSales();

    const salesArray: any[] = Array.isArray(fudoResp?.sales)
      ? fudoResp.sales
      : Array.isArray(fudoResp?.data)
        ? fudoResp.data
        : [];

    let inspected = 0;
    let applied = 0;
    let revoked = 0;
    let skippedNoPhone = 0;
    let skippedNoUser = 0;

    for (const sale of salesArray) {
      const attrs = sale.attributes || {};
      const saleId = String(sale.id);

      try {
        if (!attrs.createdAt) continue;
        if (attrs.createdAt < todayStartIso) continue;

        inspected++;

        let detail: any;
        try {
          detail = await getFudoSaleDetail(saleId);
        } catch (err: any) {
          const msg = err?.message || "detail error";
          await logSync({ sale_id: saleId, action: "STAMPS_ERROR_DETAIL", note: msg });
          if (String(msg).includes("429")) break;
          continue;
        }

        const dData = detail?.data;
        const dAttrs = dData?.attributes || {};
        const included = detail?.included || [];

        const anon = dAttrs.anonymousCustomer || null;
        const customerIncluded = included.find((i: any) => i.type === "Customer");

        const monto = dAttrs.total ?? attrs.total ?? 0;
        const estado = mapSaleStateToEstado(dAttrs.saleState);

        const fudoPhoneRaw: string | null =
          anon?.phone || customerIncluded?.attributes?.phone || null;

        const phoneNorm = normalizePhone(fudoPhoneRaw);

        if (!phoneNorm) {
          skippedNoPhone++;
          continue;
        }

        const { data: prof, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("phone_normalized", phoneNorm)
          .maybeSingle();

        if (profErr) {
          await logSync({ sale_id: saleId, action: "STAMPS_ERROR_PROFILE", note: profErr.message });
          continue;
        }

        const userId = prof?.id || null;
        if (!userId) {
          skippedNoUser++;
          continue;
        }

        const refId = `sale:${saleId}`;

        if (estado === "cancelado") {
          const r = await revokeStampByRef({
            source: "FUDO",
            refType: "order_id",
            refId,
            revokedBy: null,
            revokedReason: "sale_cancelled",
          });
          if ((r as any)?.revoked === true) revoked++;
          continue;
        }

        if (estado === grantOn) {
          const a = await applyStamp({
            userId,
            source: "FUDO",
            refType: "order_id",
            refId,
            amount: Number(monto),
          });

          if ((a as any)?.applied === true) {
            applied++;

            await fetch(`${base}/api/push/notify-stamps`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({ userId }),
            }).catch(() => null);
          }
        }
      } catch (e: any) {
        await logSync({ sale_id: saleId, action: "STAMPS_ERROR_LOOP", note: e?.message || "unknown" });
        continue;
      }
    }

    return NextResponse.json({
      ok: true,
      inspected,
      applied,
      revoked,
      skippedNoPhone,
      skippedNoUser,
      grant_on_estado: grantOn,
    });
  } catch (err: any) {
    const msg = err?.message || "Error desconocido";
    const status = String(msg).includes("429") ? 429 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
