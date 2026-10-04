import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { fetchWithTimeout } from "./fetch";

export type AdminClient = SupabaseClient<Database>;
let admin: AdminClient | null = null;

/**
 * Service-role client. Bypasses RLS — use only for server-side logging
 * (llm_calls, speech_calls, gloss_cache) and storage uploads. Never expose to the browser.
 */
export function adminClient(): AdminClient {
  if (!admin) {
    admin = createSupabaseClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout(20_000) },
    });
  }
  return admin;
}
