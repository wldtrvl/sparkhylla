import "server-only";
import { cache } from "react";
import { requireSession, type Profile } from "@/lib/session";

/** «Что нового»: entries in app_updates; what the learner has seen is profiles.settings.updates_seen_at. */
export type UpdateKind = "feature" | "content" | "fix";
export const UPDATE_KIND_LABEL: Record<UpdateKind, string> = { feature: "Новое", content: "Тексты", fix: "Улучшение" };
export const asUpdateKind = (k: string): UpdateKind => (k === "content" || k === "fix" ? k : "feature");

export function updatesSeenAt(profile: Profile): string | null {
  const v = profile.settings.updates_seen_at;
  return typeof v === "string" ? v : null;
}

/**
 * Updates she has not opened yet: the count and the newest one. Cached per request (layout + desk share it).
 * Returns nothing when the table is missing (migration 0011 not run yet), so the app keeps working.
 */
export const unseenUpdates = cache(async (): Promise<{ count: number; latest: { title: string; published_at: string } | null }> => {
  const s = await requireSession();
  const seen = updatesSeenAt(s.profile);
  let q = s.supabase.from("app_updates").select("title,published_at", { count: "exact" }).order("published_at", { ascending: false }).limit(1);
  if (seen) q = q.gt("published_at", seen);
  const { data, count, error } = await q;
  if (error) return { count: 0, latest: null };
  return { count: count ?? 0, latest: data?.[0] ?? null };
});
