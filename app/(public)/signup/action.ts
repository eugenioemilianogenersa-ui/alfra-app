// app/(public)/signup/action.ts
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabaseServer";

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const rawPhone = String(formData.get("phone") || "").trim();

  if (!email || !password || !rawPhone) {
    throw new Error("Faltan datos obligatorios");
  }

  const supabase = createClient();

  const cleanPhone = rawPhone.replace(/[^0-9+]/g, "");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/login`,
      data: {
        phone: cleanPhone,
        full_name: email.split("@")[0],
      },
    },
  });

  if (error) throw new Error(error.message);

  const user = data.user;
  if (user) {
    await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email,
          display_name: email.split("@")[0],
          phone: cleanPhone,
        },
        { onConflict: "id" }
      );
  }

  const cookieStore = await cookies();
  cookieStore.set("alfra_auth", "1", { path: "/", httpOnly: false });

  redirect("/dashboard");
}
