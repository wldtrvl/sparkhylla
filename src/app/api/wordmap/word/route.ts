import { NextResponse, type NextRequest } from "next/server";
import { normalizeTerm, statusIndex, statusOf } from "@/lib/learning/wordmap";
import { apiSession, isResponse } from "@/lib/session";
import { loadMap, ownWords } from "@/lib/wordmap-data";

interface Analogue {
  text: string;
  level: string;
  note: string;
}

/** One word of «Карта слов» for the word panel: other ways to say it, its root and its branch. */
export async function GET(req: NextRequest) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "no";
  const lemma = normalizeTerm(req.nextUrl.searchParams.get("lemma") ?? "");
  const { data: row } = await s.supabase.from("word_map").select("lemma,display,pos,level,theme,translation_ru,analogues,root,forms").eq("lang", lang).eq("lemma", lemma).maybeSingle();
  if (!row) return NextResponse.json({ error: "Слова нет на карте." }, { status: 404 });
  const [map, mine] = await Promise.all([loadMap(s.supabase, lang), ownWords(s.supabase, s.user.id, lang)]);
  const idx = statusIndex(mine);
  const brief = (l: string | null) => {
    const w = l ? map.byLemma.get(l) : undefined;
    return w ? { lemma: w.lemma, display: w.display, translation: w.translation, level: w.level, status: statusOf(w, idx) } : null;
  };
  const analogues = ((row.analogues ?? []) as unknown as Analogue[]).map((a) => {
    // a single word that is on the map can be opened from the panel
    const n = normalizeTerm(a.text);
    const hit = n.includes(" ") ? undefined : map.byForm.get(n);
    return { ...a, lemma: hit ? hit.lemma : null };
  });
  const isRoot = map.roots.has(row.lemma);
  const branchOf = isRoot ? row.lemma : row.root;
  const branch = branchOf ? map.words.filter((w) => w.root === branchOf && w.lemma !== row.lemma).slice(0, 24).map((w) => brief(w.lemma)!) : [];
  return NextResponse.json({
    lemma: row.lemma,
    display: row.display,
    pos: row.pos,
    level: row.level,
    theme: row.theme,
    translation: row.translation_ru,
    forms: row.forms,
    analogues,
    root: isRoot ? null : brief(row.root),
    isRoot,
    branch,
  });
}
