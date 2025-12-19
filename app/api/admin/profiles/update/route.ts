import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function supabaseFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseFromBearer(req);
    if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 403 });

    const r = String(role || "cliente").toLowerCase();
    const isAdmin = r === "admin";
    const isStaff = r === "staff";
    if (!isAdmin && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as
      | { userId?: string; display_name?: string; phone?: string; role?: string }
      | null;

    const userId = String(body?.userId || "").trim();
    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

    const display_name = String(body?.display_name || "").trim();
    const phone = String(body?.phone || "").trim();
    const nextRole = String(body?.role || "").trim().toLowerCase();

    const patch: any = {};
    if (display_name) patch.display_name = display_name;
    if (phone) patch.phone = phone;

    // ✅ STAFF NO puede tocar roles nunca
    if (isAdmin && nextRole) {
      if (!["admin", "staff", "delivery", "cliente", "user"].includes(nextRole)) {
        return NextResponse.json({ error: "role inválido" }, { status: 400 });
      }
      patch.role = nextRole === "user" ? "cliente" : nextRole;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("profiles/update fatal:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
