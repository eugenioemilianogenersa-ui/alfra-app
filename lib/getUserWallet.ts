// lib/getUserWallet.ts
import { createClient } from "./supabaseClient";

export type WalletEvent = {
  id: string;
  user_id: string;
  delta: number;
  reason: string | null;
  created_at: string;
};

export type WalletResult = {
  points: number;
  events: WalletEvent[];
};

export async function getUserWallet(): Promise<WalletResult> {
  const supabase = createClient();

  // 1) usuario logueado
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) {
    // Por si el middleware todavía no redirige bien
    return { points: 0, events: [] };
  }

  // 2) leer wallet y eventos EN PARALELO
  const [walletRes, eventsRes] = await Promise.all([
    supabase
      .from("loyalty_wallets")
      .select("points")
      .eq("user_id", user.id)
      .limit(1),
    supabase
      .from("loyalty_events")
      .select("id, user_id, delta, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (walletRes.error) throw walletRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const points =
    walletRes.data && walletRes.data.length > 0
      ? (walletRes.data[0].points as number)
      : 0;

  return {
    points,
    events: (eventsRes.data ?? []) as WalletEvent[],
  };
}
