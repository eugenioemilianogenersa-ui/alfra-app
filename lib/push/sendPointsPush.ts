import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export type SendPointsPushInput = {
  userId: string;
  delta: number;
  reason?: string | null;
  url?: string; // default /puntos
};

export type SendPointsPushResult = {
  ok: true;
  sent: number;
  disabled: number;
  note?: string;
};

export async function sendPointsPush(input: SendPointsPushInput): Promise<SendPointsPushResult> {
  const userId = input.userId;
  const delta = Number(input.delta || 0);
  const reason = (input.reason ?? "").trim();
  const url = input.url || "/puntos";

  if (!userId) {
    // helper silencioso: no tiramos error para no romper flows
    return { ok: true, sent: 0, disabled: 0, note: "missing userId" };
  }

  initWebPush();

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,enabled")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) {
    console.error("sendPointsPush: push_subscriptions select error:", error);
    return { ok: true, sent: 0, disabled: 0, note: "db_error" };
  }

  if (!subs || subs.length === 0) {
    return { ok: true, sent: 0, disabled: 0, note: "no_subs" };
  }

  const payload = {
    title: "AlFra – Puntos",
    body: `${delta > 0 ? "+" : ""}${delta} pts • ${reason || "Actualización"}`,
    data: { url },
  };

  let sent = 0;
  let disabled = 0;

  for (const s of subs) {
    try {
      await sendToSubscription(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload
      );
      sent++;
    } catch (e: any) {
      const statusCode = e?.statusCode;

      // 410 = suscripción muerta → la deshabilitamos
      if (statusCode === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", s.id);
        disabled++;
      }

      console.error("sendPointsPush: webpush error:", statusCode, e?.message, e?.body);
    }
  }

  return { ok: true, sent, disabled };
}
