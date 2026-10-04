/**
 * Store a server error in app_errors (migration 0008). Called from instrumentation.ts, which runs outside
 * React's server environment, so this file must not import "server-only" or the admin client module.
 */
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/env";

export async function recordServerError(
  err: unknown,
  request: { path: string; method: string },
  context: { routeType: string; routePath: string },
) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const digest = typeof err === "object" && err && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.from("app_errors").insert({
    path: request.path.slice(0, 300),
    method: request.method,
    message: message.slice(0, 1000),
    digest,
    route_type: context.routeType,
    route_path: context.routePath,
  });
  if (error) console.error("app_errors insert failed:", error.message);
}
