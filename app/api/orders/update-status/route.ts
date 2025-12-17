import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  orderId: number;
  estado: string;
  source: "APP_ADMIN" | "APP_DELIVERY";
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body?.orderId || !body?.estado || !body?.source) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // role del usuario (service role, no depende de RLS)
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const role = profile?.role;

  if (role !== "admin" && role !== "delivery") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Si es delivery, debe estar asignado a ese orderId
  if (role === "delivery") {
    const { data: d } = await supabaseAdmin
      .from("deliveries")
      .select("id")
      .eq("order_id", body.orderId)
      .eq("delivery_user_id", user.id)
      .maybeSingle();

    if (!d) {
      return NextResponse.json({ error: "Not assigned" }, { status: 403 });
    }
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
