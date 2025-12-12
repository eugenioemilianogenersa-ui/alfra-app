// lib/getUserProfile.ts
import { createClient } from "./supabaseClient";

export type AppProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return profile as AppProfile;
}
