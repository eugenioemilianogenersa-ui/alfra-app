// lib/supabaseClient.ts
import {
  createClient as createSupabaseClient,
  SupabaseClient,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase: SupabaseClient = createSupabaseClient(
  supabaseUrl,
  supabaseAnonKey
);

export function createClient(): SupabaseClient {
  return supabase;
}
