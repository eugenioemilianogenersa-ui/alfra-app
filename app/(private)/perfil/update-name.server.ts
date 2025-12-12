"use server";

import { createClient } from "@/lib/supabaseServer";

export async function updateName(fullName: string) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: getUserErr,
    } = await supabase.auth.getUser();
    if (getUserErr || !user) {
      return { ok: false, error: "Sesión inválida" };
    }

    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error desconocido" };
  }
}
