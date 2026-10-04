import "server-only";
import { after } from "next/server";
import type { Tables } from "@/lib/db-json";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Insert a log row after the response has been sent, so logging never adds latency.
 * Uses the service role (after() in Server Components cannot read cookies);
 * callers pass a user_id taken from an already verified session.
 */
type LogTable = "events" | "llm_calls" | "speech_calls";

export function insertLater<T extends LogTable>(table: T, row: Tables[T]["Insert"]) {
  after(async () => {
    // one table per call; the generic keeps each row checked against its own table
    const { error } = await adminClient().from(table as LogTable).insert(row as never);
    if (error) console.error(`${table} insert failed:`, error.message);
  });
}
