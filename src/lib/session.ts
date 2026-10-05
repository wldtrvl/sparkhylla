import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asLang, asLevels, asRecord, toJson, type Tables } from "@/lib/db-json";
import type { Database } from "@/lib/supabase/database.types";
import { insertLater } from "@/lib/log";
import { getUser, type AuthUser } from "@/lib/supabase/server";
import { frequencyBand, type KnownSets, type Lang } from "@/lib/learning/coverage";
import { loadMap, ownWords } from "@/lib/wordmap-data";

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
  supabase: SupabaseClient<Database>;
  user: AuthUser;
  profile: Profile;
}

type ProfileRow = Tables["profiles"]["Row"];

/** Narrow the stored row to the app's Profile (check-constrained text and jsonb columns). */
function toProfile(r: ProfileRow): Profile {
  return {
    user_id: r.user_id,
    display_name: r.display_name,
    role: r.role === "coach" ? "coach" : "learner",
    ui_lang: r.ui_lang === "uk" ? "uk" : "ru",
    active_lang: asLang(r.active_lang),
    levels: asLevels(r.levels),
    settings: asRecord(r.settings),
  };
}

async function loadProfile(supabase: SupabaseClient<Database>, user: AuthUser): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (data) return toProfile(data);
  // Trigger normally creates it; fall back for users created before the migration.
  const { data: created, error } = await supabase.from("profiles").insert({ user_id: user.id }).select("*").single();
  if (error || !created) throw new Error(`profile could not be created: ${error?.message ?? "no row"}`);
  return toProfile(created);
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
  const { own, learning } = await ownWordsFor(s.supabase, s.user.id, lang);
  return { known: { band: frequencyBand(lang, s.profile.levels[lang]?.reading ?? "B1"), own }, learning };
}

/**
 * A learner's own words as coverage counts them (forms, lemmas without article, parts of phrases). RLS applies.
 * A word marked on «Карта слов» brings all its forms (å gå → går, gikk, gått).
 */
export async function ownWordsFor(supabase: SupabaseClient<Database>, userId: string, lang: Lang): Promise<{ own: Set<string>; learning: string[] }> {
  const data = await ownWords(supabase, userId, lang);
  const own = new Set<string>();
  const learning: string[] = [];
  if (data.some((w) => w.source === "map")) {
    const map = await loadMap(supabase, lang);
    for (const w of data) {
      if (w.source !== "map" || w.status === "ignored") continue;
      const mw = map.byForm.get(String(w.term).toLowerCase().replace(/^(å|en|ei|et|to|a|an|the)\s+/, ""));
      mw?.forms.forEach((f) => own.add(f));
    }
  }
  for (const w of data) {
    if (w.status === "learning") learning.push(String(w.term).toLowerCase());
    own.add(String(w.term).toLowerCase());
    if (w.lemma) own.add(String(w.lemma).toLowerCase().replace(/^(å|en|ei|et|to|a|an|the)\s+/, ""));
    // phrases: each part counts as met
    String(w.term).toLowerCase().split(/\s+/).forEach((p) => p.length > 2 && own.add(p));
  }
  return { own, learning };
}

/** One row of daily_activity() (migration 0005): minutes and counts per Oslo day. */
export interface DailyActivity {
  day: string;
  minutes: number;
  reviews: number;
  words_saved: number;
  talk_turns: number;
  word_taps: number;
}

/** Server-side event (decisions the app makes, results of AI calls tied to learning). Written after the response. */
export function logEvent(s: Session, type: string, props: Record<string, unknown> = {}, path?: string) {
  insertLater("events", { user_id: s.user.id, type, props: toJson(props), path: path ?? null, app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0", created_at: new Date().toISOString() });
}
