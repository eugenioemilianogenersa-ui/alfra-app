import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    // ✅ Auth via Bearer token (NO cookies)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = userData.user.id;

    const body = await req.json();
    const { endpoint, keys, userAgent } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // ✅ Upsert por endpoint (evita que un mismo device quede pegado a otro user)
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" } // 👈 requiere índice único (SQL abajo)
      );

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("subscribe error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
