import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertLater } from "@/lib/log";
import { getUser, type AuthUser } from "@/lib/supabase/server";
import { frequencyBand, type KnownSets, type Lang } from "@/lib/learning/coverage";

export interface Profile {
  user_id: string;
  display_name: string;
  role: "learner" | "coach";
  ui_lang: "ru" | "uk";
  active_lang: Lang;
  levels: Record<Lang, { reading: string; speaking: string; writing: string }>;
  settings: Record<string, unknown>;
}

export interface Session {
  supabase: SupabaseClient;
  user: AuthUser;
  profile: Profile;
}

async function loadProfile(supabase: SupabaseClient, user: AuthUser): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (data) return data as Profile;
  // Trigger normally creates it; fall back for users created before the migration.
  const { data: created } = await supabase.from("profiles").insert({ user_id: user.id }).select("*").single();
  return created as Profile;
}

/** For pages: redirects to /login when signed out. Cached per request (layout + page share it). */
export const requireSession = cache(async (): Promise<Session> => {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user, profile: await loadProfile(supabase, user) };
});

/** For route handlers: returns a 401 response instead of redirecting. */
export async function apiSession(): Promise<Session | NextResponse> {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Войдите заново." }, { status: 401 });
  return { supabase, user, profile: await loadProfile(supabase, user) };
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

export async function knownSets(s: Session, lang: Lang): Promise<KnownSets> {
  return (await wordState(s, lang)).known;
}

/** Her words in one query: the sets used for coverage, plus the terms she is learning (reader underline). */
export async function wordState(s: Session, lang: Lang): Promise<{ known: KnownSets; learning: string[] }> {
  const { data } = await s.supabase.from("words").select("term,lemma,status").eq("user_id", s.user.id).eq("lang", lang).limit(20000);
  const own = new Set<string>();
  const learning: string[] = [];
  for (const w of data ?? []) {
    if (w.status === "learning") learning.push(String(w.term).toLowerCase());
    own.add(String(w.term).toLowerCase());
    if (w.lemma) own.add(String(w.lemma).toLowerCase().replace(/^(å|en|ei|et|to|a|an|the)\s+/, ""));
    // phrases: each part counts as met
    String(w.term).toLowerCase().split(/\s+/).forEach((p) => p.length > 2 && own.add(p));
  }
  return { known: { band: frequencyBand(lang, s.profile.levels[lang]?.reading ?? "B1"), own }, learning };
}

/** Server-side event (decisions the app makes, results of AI calls tied to learning). Written after the response. */
export function logEvent(s: Session, type: string, props: Record<string, unknown> = {}, path?: string) {
  insertLater("events", { user_id: s.user.id, type, props, path: path ?? null, app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0", created_at: new Date().toISOString() });
}
