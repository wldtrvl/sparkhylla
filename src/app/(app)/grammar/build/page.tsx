import Link from "next/link";
import { GrammarTabs } from "@/components/GrammarTabs";
import { PATTERNS, sentenceOf } from "@/lib/learning/sentences";
import { requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";

const LEVELS = ["A1", "A2", "B1", "B2"];

/** «Как строить предложения»: one note per sentence pattern, from the simplest. */
export default async function BuildIndex() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const { data: notes } = await s.supabase.from("notes").select("ref").eq("user_id", s.user.id).eq("kind", "pattern");
  const saved = new Set((notes ?? []).map((n) => n.ref));
  const patterns = PATTERNS.filter((p) => p.lang === lang).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Как строить предложения</h1>
        <p className="lead">Заметки-шпаргалки: одно предложение во всех вариантах — утверждение, отрицание, вопрос, со временем в начале, внутри придаточного. Цвет показывает роль каждой части.</p>
      </div>
      <GrammarTabs active="build" />
      <div className="grid">
        {patterns.map((p) => (
          <Link key={p.key} href={`/grammar/build/${p.key}`} className="card grammar-card">
            <div className="row" style={{ gap: 6 }}>
              <span className="chip">{p.level}</span>
              {saved.has(p.key) && <span className="chip">★</span>}
            </div>
            <b style={{ fontSize: 18 }}>{p.title}</b>
            <span className="small muted read-sentence" lang={htmlLang(lang)}>
              {sentenceOf(p.variations[0])}
            </span>
            <span className="small muted">вариантов: {p.variations.length}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
