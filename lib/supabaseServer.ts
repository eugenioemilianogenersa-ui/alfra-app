// lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export function createClient() {
  // Usamos la función cookies de Next directamente
  return createServerComponentClient({
    cookies,
  });
}
