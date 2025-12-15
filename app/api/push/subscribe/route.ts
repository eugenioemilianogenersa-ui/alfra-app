import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  const body = await req.json();
  const endpoint = body.endpoint as string;
  const p256dh = body.keys?.p256dh as string;
  const auth = body.keys?.auth as string;
  const userAgent = body.userAgent as string | undefined;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  // prefs default
  await supabaseAdmin.from("notification_preferences").upsert({
    user_id: data.user.id,
    pedidos: true,
    puntos: true,
    promos: true,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
    user_id: data.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent ?? null,
    enabled: true,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
