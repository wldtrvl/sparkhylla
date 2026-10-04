import "server-only";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Insert a log row after the response has been sent, so logging never adds latency.
 * Uses the service role (after() in Server Components cannot read cookies);
 * callers pass a user_id taken from an already verified session.
 */
export function insertLater(table: "events" | "llm_calls" | "speech_calls", row: Record<string, unknown>) {
  after(async () => {
    const { error } = await adminClient().from(table).insert(row);
    if (error) console.error(`${table} insert failed:`, error.message);
  });
}
