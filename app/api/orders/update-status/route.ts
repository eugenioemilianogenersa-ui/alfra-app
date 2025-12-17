import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  orderId: number;
  estado: string;
  source: "APP_ADMIN" | "APP_DELIVERY";
  accessToken: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body?.accessToken) {
      return NextResponse.json({ error: "Missing accessToken" }, { status: 401 });
    }
    if (!body?.orderId || !body?.estado || !body?.source) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // ✅ Validar token (sin cookies, evita crash en Vercel)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
      body.accessToken
    );

    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = userData.user;

    // role del usuario
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const role = profile?.role;

    // Solo admin o delivery
    if (role !== "admin" && role !== "delivery") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Si es delivery, debe estar asignado
    if (role === "delivery") {
      const { data: d } = await supabaseAdmin
        .from("deliveries")
        .select("id")
        .eq("order_id", body.orderId)
        .eq("delivery_user_id", user.id)
        .maybeSingle();

      if (!d) return NextResponse.json({ error: "Not assigned" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        estado: body.estado,
        estado_source: body.source,
      })
      .eq("id", body.orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
