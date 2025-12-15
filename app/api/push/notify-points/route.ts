import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  // Seguridad: solo admin logueado
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (prof?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const userId = body.userId as string;
  const delta = Number(body.delta);
  const reason = (body.reason as string) || "Movimiento de puntos";

  if (!userId || !Number.isFinite(delta)) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  // Respetar preferencias
  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("puntos")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefs && prefs.puntos === false) return NextResponse.json({ ok: true, skipped: "prefs" });

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, skipped: "no_subs" });

  initWebPush();

  const title = "💎 Puntos AlFra";
  const bodyText = delta > 0
    ? `Se te acreditaron +${delta} pts. ${reason}`
    : `Se ajustaron ${delta} pts. ${reason}`;

  const payload = {
    title,
    body: bodyText,
    data: { url: "/cliente/puntos" },
  };

  // enviar a todas las suscripciones del usuario
  for (const s of subs) {
    try {
      await sendToSubscription(s, payload);
    } catch (e: any) {
      // si falla por sub inválida, luego lo desactivamos
      // (no corto el loop)
    }
  }

  return NextResponse.json({ ok: true });
}
