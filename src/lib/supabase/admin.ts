import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use only for server-side logging
 * (llm_calls, speech_calls, gloss_cache) and storage uploads. Never expose to the browser.
 */
export function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createSupabaseClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
