import "server-only";
import { bandSize, fitFromLevel, fitGroup, type FitGroup, type Lang } from "@/lib/learning/coverage";
import { wordState, type Session } from "@/lib/session";

export interface TextRow {
  id: string;
  lang: Lang;
  title: string;
  author: string;
  author_note: string | null;
  year: string | null;
  kind: string;
  availability: "in_app" | "external";
  body: string | null;
  source_url: string | null;
  license: string | null;
  est_level: string | null;
  word_count: number | null;
  tags: string[];
}

/** Everything the library and desk show about a book; never the body. */
export const LIBRARY_COLUMNS = "id,lang,title,author,author_note,year,kind,availability,source_url,license,est_level,word_count,tags";
export const TEXT_COLUMNS = `${LIBRARY_COLUMNS},body`;

export interface LibraryItem extends Omit<TextRow, "body"> {
  coverage: number | null; // null when there is no stored vocabulary (external books, or not built yet)
  group: FitGroup;
  progress: { page: number; finished: boolean } | null;
}

/**
 * Library ordered by fit: books where she knows most words come first. Originals only — never adapted.
 * Coverage is computed in the database from each book's stored vocabulary (text_fit), so no book text is sent.
 */
export async function libraryFor(s: Session, lang: Lang): Promise<LibraryItem[]> {
  const reading = s.profile.levels[lang]?.reading ?? "B1";
  // her words are needed for text_fit; the book list and progress load at the same time
  const fitQuery = wordState(s, lang).then((w) => s.supabase.rpc("text_fit", { p_lang: lang, p_band: bandSize(reading), p_own: [...w.known.own] }));
  const [{ data: texts }, { data: prog }, fit] = await Promise.all([
    s.supabase.from("texts").select(LIBRARY_COLUMNS).eq("lang", lang).eq("active", true),
    s.supabase.from("reading_progress").select("text_id,page,finished_at").eq("user_id", s.user.id),
    fitQuery,
  ]);
  if (fit.error) console.error("text_fit failed (run migration 0003?):", fit.error.message);
  const cov = new Map<string, number>();
  for (const r of (fit.data ?? []) as { text_id: string; known_tokens: number; total_tokens: number }[]) {
    if (r.total_tokens > 0) cov.set(r.text_id, Number(r.known_tokens) / r.total_tokens);
  }
  const progress = new Map((prog ?? []).map((p) => [p.text_id as string, p]));
  const items: LibraryItem[] = ((texts ?? []) as Omit<TextRow, "body">[]).map((t) => {
    const p = progress.get(t.id);
    const c = t.availability === "in_app" ? (cov.get(t.id) ?? null) : null;
    return {
      ...t,
      coverage: c,
      group: c != null ? fitGroup(c) : fitFromLevel(t.est_level, reading),
      progress: p ? { page: p.page, finished: !!p.finished_at } : null,
    };
  });
  const order: Record<FitGroup, number> = { fits: 0, stretch: 1, later: 2 };
  return items.sort((a, b) => order[a.group] - order[b.group] || (b.coverage ?? 0.94) - (a.coverage ?? 0.94));
}

export const COVER_COLORS = ["#7b2d26", "#2c3e5a", "#a97a2c", "#2e4a3b", "#5a3a4a", "#4a3a2a"];
export function coverColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_COLORS[h % COVER_COLORS.length];
}
