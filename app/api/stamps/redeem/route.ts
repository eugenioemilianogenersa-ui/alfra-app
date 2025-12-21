import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CookiesToSetItem = { name: string; value: string; options: CookieOptions };

export async function POST(req: NextRequest) {
  try {
    const res = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet: CookiesToSetItem[]) => cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options)),
        },
      }
    );

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: w } = await supabaseAdmin
      .from("stamps_wallet")
      .select("current_stamps")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = Number(w?.current_stamps ?? 0);
    if (current < 8) return NextResponse.json({ error: "No alcanza para canjear" }, { status: 409 });

    const next = current - 8;

    await supabaseAdmin
      .from("stamps_wallet")
      .update({ current_stamps: next, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    await supabaseAdmin.from("stamps_redemptions").insert({
      user_id: user.id,
      stamps_used: 8,
      created_by: user.id,
    });

    return NextResponse.json({ ok: true, current_stamps: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
