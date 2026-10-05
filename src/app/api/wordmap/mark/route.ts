import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { toJson, type Tables } from "@/lib/db-json";
import { newCard } from "@/lib/learning/srs";
import { normalizeTerm, planMarks } from "@/lib/learning/wordmap";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { loadMap, ownWords } from "@/lib/wordmap-data";

const Body = z.object({
  lang: z.enum(["no", "en"]),
  lemmas: z.array(z.string().min(1).max(80)).min(1).max(1000),
  /** known: «Знаю»; learning: «Учить» (goes to review); none: take the «Знаю» mark off */
  status: z.enum(["known", "learning", "none"]),
});

/**
 * Mark map words for her. Saved in `words` (source «map»), so the reading fit counts them too.
 * Words in review are never changed by a group mark, and never deleted from here: that is «Мои слова».
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const [map, mine] = await Promise.all([loadMap(s.supabase, b.lang), ownWords(s.supabase, s.user.id, b.lang)]);
  const targets = [...new Set(b.lemmas.map(normalizeTerm))].map((l) => map.byLemma.get(l)).filter((w) => !!w);
  const plan = planMarks(targets, mine, b.status, b.lemmas.length === 1);
  const now = new Date();
  const toKnown = plan.toKnown;
  const toLearning = plan.toLearning;
  const toDelete = plan.remove;
  const inserts: Tables["words"]["Insert"][] = plan.insert.map((lemma) => {
    const w = map.byLemma.get(lemma)!;
    const card = b.status === "learning" ? newCard(now) : null;
    return {
      user_id: s.user.id,
      lang: b.lang,
      term: w.display,
      lemma: w.display,
      translation: w.translation || null,
      kind: "word",
      status: b.status === "learning" ? "learning" : "known",
      source: "map",
      fsrs: card ? toJson(card) : null,
      due: card ? now.toISOString() : null,
      updated_at: now.toISOString(),
    };
  });

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await s.supabase.from("words").insert(inserts.slice(i, i + 500));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toKnown.length) {
    const { error } = await s.supabase.from("words").update({ status: "known", fsrs: null, due: null, updated_at: now.toISOString() }).in("id", toKnown).eq("user_id", s.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toLearning.length) {
    const card = newCard(now);
    const { error } = await s.supabase.from("words").update({ status: "learning", fsrs: toJson(card), due: now.toISOString(), updated_at: now.toISOString() }).in("id", toLearning).eq("user_id", s.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toDelete.length) {
    const { error } = await s.supabase.from("words").delete().in("id", toDelete).eq("user_id", s.user.id).eq("status", "known");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const changed = inserts.length + toKnown.length + toLearning.length + toDelete.length;
  const single = b.lemmas.length === 1;
  logEvent(s, "map.mark", { lang: b.lang, status: b.status, asked: b.lemmas.length, changed, group: !single, lemma: single ? targets[0]?.lemma : undefined });
  return NextResponse.json({ changed });
}
