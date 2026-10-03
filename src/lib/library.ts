import "server-only";
import { coverage, fitFromLevel, fitGroup, type FitGroup, type Lang } from "@/lib/learning/coverage";
import { knownSets, type Session } from "@/lib/session";

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

export interface LibraryItem extends Omit<TextRow, "body"> {
  coverage: number | null; // null for external texts (no full text)
  group: FitGroup;
  progress: { page: number; finished: boolean } | null;
}

/** Library ordered by fit: books where she knows most words come first. Originals only — never adapted. */
export async function libraryFor(s: Session, lang: Lang): Promise<LibraryItem[]> {
  const [{ data: texts }, { data: prog }, known] = await Promise.all([
    s.supabase.from("texts").select("*").eq("lang", lang).eq("active", true),
    s.supabase.from("reading_progress").select("text_id,page,finished_at").eq("user_id", s.user.id),
    knownSets(s, lang),
  ]);
  const reading = s.profile.levels[lang]?.reading ?? "B1";
  const items: LibraryItem[] = (texts ?? []).map((t: TextRow) => {
    const p = (prog ?? []).find((x) => x.text_id === t.id);
    const cov = t.availability === "in_app" && t.body ? coverage(t.body, known).coverage : null;
    const { body: _body, ...meta } = t;
    void _body;
    return {
      ...meta,
      coverage: cov,
      group: cov != null ? fitGroup(cov) : fitFromLevel(t.est_level, reading),
      progress: p ? { page: p.page, finished: !!p.finished_at } : null,
    };
  });
  const order: Record<FitGroup, number> = { fits: 0, stretch: 1, later: 2 };
  return items.sort((a, b) => order[a.group] - order[b.group] || (b.coverage ?? 0.94) - (a.coverage ?? 0.94));
}

/** Split a body into pages of whole paragraphs (~1600 characters each). */
export function paginate(body: string, target = 1600): string[][] {
  const paras = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const pages: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    if (len > 0 && len + p.length > target) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[""]];
}

export const COVER_COLORS = ["#7b2d26", "#2c3e5a", "#a97a2c", "#2e4a3b", "#5a3a4a", "#4a3a2a"];
export function coverColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_COLORS[h % COVER_COLORS.length];
}
