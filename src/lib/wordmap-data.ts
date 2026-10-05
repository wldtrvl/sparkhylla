import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/ai/prompts";
import type { Database } from "@/lib/supabase/database.types";
import { asPos, CONTENT_POS, type MapLevel, type MapWord, type Theme } from "@/lib/learning/wordmap";

type Db = SupabaseClient<Database>;
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

/** Every row of a query, page by page (the API caps a response at 1000 rows). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export interface LoadedMap {
  words: MapWord[];
  byLemma: Map<string, MapWord>;
  /** any form or lemma → the map word it belongs to */
  byForm: Map<string, MapWord>;
  roots: Map<string, MapWord>;
}

// The map is the same for everyone and changes only when the build runs: keep it per server instance,
// and reload when the newest updated_at changes.
const cache = new Map<Lang, { stamp: string; map: LoadedMap }>();

export async function loadMap(db: Db, lang: Lang): Promise<LoadedMap> {
  const { data: last } = await db.from("word_map").select("updated_at").eq("lang", lang).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const stamp = last?.updated_at ?? "";
  const hit = cache.get(lang);
  if (hit && hit.stamp === stamp) return hit.map;
  const rows = stamp
    ? await fetchAll((from, to) =>
        db.from("word_map").select("lemma,display,pos,forms,rank,level,theme,translation_ru,root").eq("lang", lang).eq("skip", false).not("theme", "is", null).order("rank").range(from, to),
      )
    : [];
  const words: MapWord[] = rows.map((r) => ({
    lemma: r.lemma,
    display: r.display,
    pos: asPos(r.pos),
    forms: r.forms ?? [],
    rank: r.rank,
    level: r.level as MapLevel,
    theme: r.theme as Theme | null,
    translation: r.translation_ru ?? "",
    root: r.root,
  }));
  const byLemma = new Map(words.map((w) => [w.lemma, w]));
  const byForm = new Map<string, MapWord>();
  for (const w of words) for (const f of [...w.forms, w.lemma]) if (!byForm.has(f)) byForm.set(f, w);
  const roots = new Map(words.filter(isRootWord).map((w) => [w.lemma, w]));
  const map = { words, byLemma, byForm, roots };
  cache.set(lang, { stamp, map });
  return map;
}

/** Basic words that harder words hang under: A1 content words (same rule as the build). */
export const isRootWord = (w: MapWord) => w.level === "A1" && CONTENT_POS.has(w.pos) && w.theme !== "grammar";

export interface OwnWord {
  id: string;
  term: string;
  lemma: string | null;
  status: string;
  source: string | null;
}

/** All of a learner's words in a language (RLS applies), paged past the 1000-row cap. */
export function ownWords(db: Db, userId: string, lang: Lang): Promise<OwnWord[]> {
  return fetchAll((from, to) => db.from("words").select("id,term,lemma,status,source").eq("user_id", userId).eq("lang", lang).order("created_at").range(from, to));
}
