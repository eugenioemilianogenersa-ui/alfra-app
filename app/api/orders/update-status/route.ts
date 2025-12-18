import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRouteClient } from "@/lib/supabaseRoute";

type Body = {
  orderId: number;
  estado: string;
  source: "APP_ADMIN" | "APP_DELIVERY";
};

export async function POST(req: Request) {
  const supabase = createRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!body?.orderId || !body?.estado || !body?.source) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // role del usuario (service role para que no afecte RLS)
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

  // Si es delivery, debe tener asignado ese orderId
  if (role === "delivery") {
    const { data: d, error: dErr } = await supabaseAdmin
      .from("deliveries")
      .select("id")
      .eq("order_id", body.orderId)
      .eq("delivery_user_id", user.id)
      .maybeSingle();

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
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
}
