import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  // Solo admin
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
  const newsId = body.newsId as string;
  const title = (body.title as string) || "Novedad AlFra";
  const summary = (body.summary as string) || "Entrá a ver la novedad.";

  if (!newsId) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  // Buscar clientes
  const { data: clientes } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("role", "cliente");

  if (!clientes || clientes.length === 0) return NextResponse.json({ ok: true, skipped: "no_clients" });

  initWebPush();

  // Por cada cliente: verificar prefs.promos y mandar a sus subs
  for (const c of clientes) {
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("promos")
      .eq("user_id", c.id)
      .maybeSingle();

    if (prefs && prefs.promos === false) continue;

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", c.id)
      .eq("enabled", true);

    if (!subs || subs.length === 0) continue;

    const payload = {
      title: `📰 ${title}`,
      body: summary,
      data: { url: `/cliente/novedades/${newsId}` },
    };

    for (const s of subs) {
      try {
        await sendToSubscription(s, payload);
      } catch (e: any) {
        // no corto
      }
    }
  }

  return NextResponse.json({ ok: true });
}
