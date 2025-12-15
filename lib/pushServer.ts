import webpush from "web-push";

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function initWebPush() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@alfra.app";

  if (!pub || !priv) {
    throw new Error("Missing VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }

  webpush.setVapidDetails(subj, pub, priv);
}

export async function sendToSubscription(sub: SubRow, payload: any): Promise<{
  ok: boolean;
  statusCode?: number;
  message?: string;
}> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (e: any) {
    return {
      ok: false,
      statusCode: e?.statusCode,
      message: e?.message,
    };
  }
}
