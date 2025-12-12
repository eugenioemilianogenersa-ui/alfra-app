import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usamos la llave maestra para crear usuarios sin restricciones
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName, phone, role } = body;

    // 1. Crear el usuario en el sistema de Autenticación
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, 
      user_metadata: {
        full_name: displayName,
        phone: phone
      }
    });

    if (authError) throw authError;

    if (authData.user) {
      // 2. Asegurar datos en el perfil
      // Quitamos 'updated_at' para evitar el error de columna inexistente
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: authData.user.id,
          email: email,
          display_name: displayName,
          phone: phone,
          role: role || 'cliente'
        });

      if (profileError) throw profileError;
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error: any) {
    console.error("Error creando usuario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}