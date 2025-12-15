import webpush from "web-push";

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function initWebPush() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const priv = process.env.VAPID_PRIVATE_KEY!;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@alfra.app";

  webpush.setVapidDetails(subj, pub, priv);
}

export async function sendToSubscription(
  sub: SubRow,
  payload: any
) {
  return webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify(payload)
  );
}
