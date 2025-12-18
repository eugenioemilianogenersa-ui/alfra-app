"use client";

import { createClient } from "@/lib/supabaseClient";

type UpdateOrderStatusArgs = {
  orderId: number;
  estado: string;
  source?: "APP_ADMIN" | "APP_DELIVERY" | "FUDO" | "API";
};

export async function updateOrderStatus({
  orderId,
  estado,
  source = "API",
}: UpdateOrderStatusArgs) {
  const supabase = createClient();

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const r = await fetch("/api/orders/update-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ orderId, estado, source }),
  });

  const json = await r.json().catch(() => ({} as any));

  if (!r.ok) {
    const msg = (json as any)?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  return json as { ok: true; orderId: number; estado: string };
}
