import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteButton, PatternVariation } from "@/components/Grammar";
import { GRAMMAR } from "@/lib/learning/grammar";
import { patternOf, ROLE_LABEL, type Role } from "@/lib/learning/sentences";
import { requireSession } from "@/lib/session";

/** A sentence-building note: the idea, the formula in colours, every variation of one sentence, tips. */
export default async function PatternPage({ params }: PageProps<"/grammar/build/[key]">) {
  const s = await requireSession();
  const { key } = await params;
  const p = patternOf(decodeURIComponent(key));
  if (!p) notFound();
  const { data: note } = await s.supabase.from("notes").select("body").eq("user_id", s.user.id).eq("kind", "pattern").eq("ref", p.key).maybeSingle();
  const roles = [...new Set(p.variations.flatMap((v) => v.parts.map(([, r]) => r)))] as Role[];
  const rules = GRAMMAR.filter((g) => p.rules.includes(g.key));
  return (
    <>
      <Link href="/grammar/build" className="strong">
        ← Как строить предложения
      </Link>
      <div className="stack gap-4">
        <span className="eyebrow">Заметка · {p.level}</span>
        <h1 className="display">{p.title}</h1>
      </div>
      <div className="split">
        <div className="wide stack" style={{ gap: 16 }}>
          <section className="card">
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>{p.idea}</p>
            <div className="rule-pattern">
              <span className="eyebrow">Формула</span>
              <span className="pattern-parts">
                {p.formula.map((r, i) => (
                  <span key={i} className={`part role-${r}`}>
                    {ROLE_LABEL[r]}
                  </span>
                ))}
              </span>
            </div>
          </section>
          <section className="card">
            <h2 className="h2">Все варианты одного предложения</h2>
            <div className="stack" style={{ gap: 14 }}>
              {p.variations.map((v, i) => (
                <PatternVariation key={v.label} v={v} lang={p.lang} seed={`${p.key}:${i}`} />
              ))}
            </div>
            <div className="role-legend small">
              {roles.map((r) => (
                <span key={r} className={`part role-${r}`}>
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </div>
          </section>
          {p.tips.length > 0 && (
            <section className="card">
              <h2 className="h2">Запомнить</h2>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="stack gap-6">
                {p.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="side">
          <section className="card">
            <span className="eyebrow">Мои заметки</span>
            <NoteButton lang={p.lang} kind="pattern" refKey={p.key} saved={!!note} body={note?.body ?? ""} />
            {note?.body && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{note.body}</p>}
          </section>
          {rules.length > 0 && (
            <section className="card">
              <span className="eyebrow">Правила с упражнениями</span>
              {rules.map((r) => (
                <Link key={r.key} href={`/grammar/${r.key}`}>
                  {r.title} →
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
