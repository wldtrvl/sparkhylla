import Link from "next/link";
import { GrammarTabs } from "@/components/GrammarTabs";
import { CATEGORY_LABEL, GRAMMAR, type GrammarCategory } from "@/lib/learning/grammar";
import { requireSession } from "@/lib/session";

const LEVELS = ["A1", "A2", "B1", "B2"];

/** «Грамматика»: rules by topic, where she makes mistakes first, with her practice score and notes. */
export default async function GrammarPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const [{ data: fb }, { data: answers }, { data: notes }] = await Promise.all([
    s.supabase.from("feedback_items").select("rule_key,status").eq("user_id", s.user.id).eq("lang", lang),
    s.supabase.from("events").select("props").eq("user_id", s.user.id).eq("type", "grammar.answer").order("created_at", { ascending: false }).limit(2000),
    s.supabase.from("notes").select("ref").eq("user_id", s.user.id).eq("kind", "rule"),
  ]);
  const mistakes: Record<string, number> = {};
  for (const f of fb ?? []) if (f.rule_key) mistakes[f.rule_key] = (mistakes[f.rule_key] ?? 0) + 1;
  const practice: Record<string, { right: number; total: number }> = {};
  for (const e of answers ?? []) {
    const p = e.props as { key?: string; correct?: boolean };
    if (!p.key) continue;
    const t = (practice[p.key] ??= { right: 0, total: 0 });
    t.total++;
    if (p.correct) t.right++;
  }
  const saved = new Set((notes ?? []).map((n) => n.ref));
  const topics = GRAMMAR.filter((g) => g.lang === lang);
  const top = topics.filter((t) => mistakes[t.key]).sort((a, b) => mistakes[b.key] - mistakes[a.key]).slice(0, 3);
  const categories = (Object.keys(CATEGORY_LABEL) as GrammarCategory[]).filter((c) => topics.some((t) => t.category === c));

  const card = (t: (typeof topics)[number]) => (
    <Link key={t.key} href={`/grammar/${t.key}`} className="card grammar-card">
      <div className="row" style={{ gap: 6 }}>
        <span className="chip">{t.level}</span>
        {mistakes[t.key] ? <span className="chip brass">в разговорах: {mistakes[t.key]}</span> : null}
        {saved.has(t.key) && (
          <span className="chip" title="в моих заметках">
            ★
          </span>
        )}
      </div>
      <b style={{ fontSize: 18 }}>{t.title}</b>
      {t.pattern && <span className="small muted">{t.pattern}</span>}
      {practice[t.key] && (
        <span className="small" style={{ color: "var(--ok)" }}>
          упражнения: верно {practice[t.key].right} из {practice[t.key].total}
        </span>
      )}
    </Link>
  );

  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Грамматика</h1>
        <p className="lead">Правила с упражнениями, которые проверяются сразу, и заметки о том, как строить предложения. Начните с тем, где были ошибки в разговорах.</p>
      </div>
      <GrammarTabs active="rules" />
      {top.length > 0 && (
        <section className="stack gap-14">
          <h2 className="h2">Начните с этого</h2>
          <div className="grid">{top.map(card)}</div>
        </section>
      )}
      {categories.map((c) => (
        <section key={c} className="stack gap-14">
          <h2 className="h2">{CATEGORY_LABEL[c]}</h2>
          <div className="grid">
            {topics
              .filter((t) => t.category === c)
              .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
              .map(card)}
          </div>
        </section>
      ))}
    </>
  );
}
