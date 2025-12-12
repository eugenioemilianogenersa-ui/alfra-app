import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
        return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    }

    // 1. Borrar de Auth (Esto elimina el login y cascadea si está configurado)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (authError) throw authError;

    // 2. Borrar de Profiles (Por si no hay cascada automática)
    const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", userId);

    if (profileError) console.error("Error borrando perfil:", profileError);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Error eliminando usuario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}