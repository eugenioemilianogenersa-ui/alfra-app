// app/(public)/login/action.ts
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
// si ya tenés el alias @/ funcionando, usá esta:
import { createClient } from "@/lib/supabaseServer";
// si NO tenés alias, usá la ruta relativa:
// import { createClient } from "../../../lib/supabaseServer";

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // en una server action podrías lanzar error o devolverlo
    throw new Error(error.message);
  }

  // si todo ok, mandamos al dashboard
  redirect("/dashboard");
}
