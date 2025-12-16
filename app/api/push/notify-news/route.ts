import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRouteClient } from "@/lib/supabaseRoute";
import { initWebPush, sendToSubscription } from "@/lib/pushServer";

export async function POST(req: Request) {
  try {
    // ✅ Solo admin (auth correcta en Route Handler)
    const supabase = createRouteClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 });
    }
    if (!auth?.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
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

    // ✅ SOLO clientes
    const { data: clientes, error: cErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "cliente");

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_clients" });
    }

    initWebPush();

    const payload = {
      title: `📰 ${title}`,
      body: summary,
      data: { url: "/dashboard" }, // ✅ Inicio real
    };

    let sent = 0;
    let disabled = 0;
    let clientsNotified = 0;

    for (const c of clientes) {
      const { data: prefs } = await supabaseAdmin
        .from("notification_preferences")
        .select("promos")
        .eq("user_id", c.id)
        .maybeSingle();

      if (prefs && prefs.promos === false) continue;

      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", c.id)
        .eq("enabled", true);

      if (!subs || subs.length === 0) continue;

      clientsNotified++;

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

    console.log("[notify-news]", { newsId, sent, disabled, clientsNotified });

    return NextResponse.json({ ok: true, newsId, sent, disabled, clientsNotified });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
