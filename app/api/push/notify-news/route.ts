import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  try {
    // ✅ Solo admin (con sesión/cookies)
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

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

    if (!newsId) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }

    // ✅ Clientes
    const { data: clientes, error: cErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "cliente");

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_clients" });
    }

    initWebPush();

    const payload = {
      title: `📰 ${title}`,
      body: summary,
      data: { url: "/dashboard" }, // ✅ Inicio real del cliente
    };

    let clientsTotal = clientes.length;
    let clientsNotified = 0;
    let subsFound = 0;
    let sent = 0;
    let disabled = 0;

    for (const c of clientes) {
      // prefs opcional (si no existe, manda igual)
      const { data: prefs } = await supabaseAdmin
        .from("notification_preferences")
        .select("promos")
        .eq("user_id", c.id)
        .maybeSingle();

      if (prefs && prefs.promos === false) continue;

      const { data: subs, error: sErr } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", c.id)
        .eq("enabled", true);

      if (sErr) continue;
      if (!subs || subs.length === 0) continue;

      clientsNotified++;
      subsFound += subs.length;

      for (const s of subs) {
        try {
          await sendToSubscription(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload
          );
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 410) {
            await supabaseAdmin
              .from("push_subscriptions")
              .update({ enabled: false, updated_at: new Date().toISOString() })
              .eq("id", s.id);
            disabled++;
          }
        }
      }
    }

    console.log("[notify-news]", {
      newsId,
      clientsTotal,
      clientsNotified,
      subsFound,
      sent,
      disabled,
    });

    return NextResponse.json({
      ok: true,
      newsId,
      clientsTotal,
      clientsNotified,
      subsFound,
      sent,
      disabled,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
