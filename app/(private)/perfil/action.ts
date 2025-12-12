// app/(private)/perfil/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabaseServer";

export async function updateProfileAction(formData: FormData) {
  const c = await cookies();
  const email = c.get("alfra_email")?.value;
  if (!email) throw new Error("Sin email en sesión");

  const display_name = String(formData.get("display_name") || "");
  const avatar_url = String(formData.get("avatar_url") || "");

  const supabase = createClient();
  await supabase
    .from("profiles")
    .upsert(
      {
        email,
        display_name: display_name || null,
        avatar_url: avatar_url || null,
      },
      { onConflict: "email" }
    );

  revalidatePath("/perfil");
}
