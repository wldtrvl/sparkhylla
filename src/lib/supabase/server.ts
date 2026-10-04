import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { fetchWithTimeout } from "./fetch";

/** Supabase client acting as the signed-in user (RLS applies). One per request. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { fetch: fetchWithTimeout(15_000) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Returns the signed-in user or null. getClaims() verifies the JWT signature locally
 * (asymmetric signing keys) and only falls back to a network call for legacy secrets.
 * Cached per request, so the layout and the page share one check.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  const user: AuthUser | null = c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : null } : null;
  return { supabase, user };
});
