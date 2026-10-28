import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplainButton } from "@/components/ExplainButton";
import { GrammarDrill, NoteButton } from "@/components/Grammar";
import { Speak } from "@/components/Speak";
import { CATEGORY_LABEL, GRAMMAR } from "@/lib/learning/grammar";
import { PATTERNS } from "@/lib/learning/sentences";
import { requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";

/** One grammar rule: the rule and how it is built, typical mistakes, her own sentences, and checked practice. */
export default async function RulePage({ params }: PageProps<"/grammar/[key]">) {
  const s = await requireSession();
  const { key } = await params;
  const rule = GRAMMAR.find((g) => g.key === decodeURIComponent(key));
  if (!rule) notFound();
  const [{ data: mine }, { data: note }] = await Promise.all([
    s.supabase.from("feedback_items").select("said,correction,hint,created_at").eq("user_id", s.user.id).eq("rule_key", rule.key).order("created_at", { ascending: false }).limit(8),
    s.supabase.from("notes").select("body").eq("user_id", s.user.id).eq("kind", "rule").eq("ref", rule.key).maybeSingle(),
  ]);
  const langAttr = htmlLang(rule.lang);
  const patterns = PATTERNS.filter((p) => p.rules.includes(rule.key));

  return (
    <>
      <Link href="/grammar" className="strong">
        ← Грамматика
      </Link>
      <div className="stack gap-4">
        <span className="eyebrow">
          {CATEGORY_LABEL[rule.category]} · {rule.level}
        </span>
        <h1 className="display">{rule.title}</h1>
      </div>
      <div className="split">
        <div className="wide stack" style={{ gap: 16 }}>
          <section className="card">
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>{rule.body}</p>
            {rule.pattern && (
              <div className="rule-pattern">
                <span className="eyebrow">Как строится</span>
                <b>{rule.pattern}</b>
              </div>
            )}
            <div className="stack" style={{ gap: 8 }}>
              {rule.examples.map(([o, tr]) => (
                <div key={o} className="row" style={{ gap: 8, alignItems: "baseline" }}>
                  <Speak text={o} lang={rule.lang} />
                  <span>
                    <span lang={langAttr} className="read-sentence">
                      {o}
                    </span>
                    <br />
                    <span className="small muted">{tr}</span>
                  </span>
                </div>
              ))}
            </div>
            {rule.bridge && (
              <div className="small" style={{ background: "var(--cloth-soft)", borderRadius: 12, padding: "10px 12px" }}>
                <b>Мостик из норвежского:</b> {rule.bridge}
              </div>
            )}
          </section>
          {rule.mistakes && rule.mistakes.length > 0 && (
            <section className="card">
              <h2 className="h2">Частые ошибки</h2>
              {rule.mistakes.map(([w, r]) => (
                <div key={w} className="mistake-row" lang={langAttr}>
                  <span className="wrong">{w}</span>
                  <span aria-hidden="true">→</span>
                  <span className="right">{r}</span>
                </div>
              ))}
            </section>
          )}
          {mine && mine.length > 0 && (
            <section className="card">
              <h2 className="h2">Ваши фразы из разговоров</h2>
              <p className="small muted" style={{ margin: 0 }}>
                Здесь это правило подвело именно вас. Они есть и в упражнениях ниже.
              </p>
              {mine.map((f, i) => (
                <div key={i} className="mistake-row" lang={langAttr}>
                  <span className="wrong">{f.said}</span>
                  <span aria-hidden="true">→</span>
                  <span className="right">{f.correction}</span>
                </div>
              ))}
            </section>
          )}
          <section className="card">
            <h2 className="h2">Упражнения</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Выбрать форму, собрать предложение, исправить ошибку — каждый ответ проверяется сразу.
            </p>
            <GrammarDrill ruleKey={rule.key} lang={rule.lang} />
          </section>
          <section className="card">
            <h2 className="h2">Подробнее</h2>
            <ExplainButton topicKey={rule.key} />
          </section>
        </div>
        <aside className="side">
          <section className="card">
            <span className="eyebrow">Мои заметки</span>
            <NoteButton lang={rule.lang} kind="rule" refKey={rule.key} saved={!!note} body={note?.body ?? ""} />
            {note?.body && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{note.body}</p>}
          </section>
          {patterns.length > 0 && (
            <section className="card">
              <span className="eyebrow">Как строить предложения</span>
              {patterns.map((p) => (
                <Link key={p.key} href={`/grammar/build/${p.key}`}>
                  {p.title} →
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
