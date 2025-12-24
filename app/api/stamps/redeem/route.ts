import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

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
          setAll: (cookiesToSet: CookiesToSetItem[]) =>
            cookiesToSet.forEach((c) => res.cookies.set(c.name, c.value, c.options)),
        },
      }
    );

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rewardName = "1 Pinta Simple + Burguer Simple GRATIS";

    const { data: out, error } = await supabase.rpc("redeem_stamps_create_voucher", {
      p_reward_name: rewardName,
    });

    if (error) {
      const msg = String(error.message || "Error");
      const status =
        msg.toLowerCase().includes("no alcanza") || msg.toLowerCase().includes("no wallet")
          ? 409
          : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    const row = Array.isArray(out) ? out[0] : out;

    return NextResponse.json({
      ok: true,
      reward_name: rewardName,
      code: row.code,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      current_stamps: row.current_stamps,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
