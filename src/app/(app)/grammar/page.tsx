import { ExplainButton } from "@/components/ExplainButton";
import { GRAMMAR } from "@/lib/learning/grammar";
import { requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";

export default async function GrammarPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const { data: fb } = await s.supabase.from("feedback_items").select("rule_key,status").eq("user_id", s.user.id).eq("lang", lang);
  const counts: Record<string, { all: number; open: number }> = {};
  for (const f of fb ?? []) {
    if (!f.rule_key) continue;
    const c = (counts[f.rule_key] ??= { all: 0, open: 0 });
    c.all++;
    if (f.status === "open") c.open++;
  }
  const topics = GRAMMAR.filter((g) => g.lang === lang);
  const levels = Array.from(new Set(topics.map((t) => t.level)));
  const langAttr = htmlLang(lang);

  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Грамматика</h1>
        <p className="lead">Темы по уровням. Отмечены те, где у вас были ошибки в разговорах — с них полезнее всего начать.</p>
      </div>
      {levels.map((lv) => (
        <section key={lv} className="stack gap-14">
          <h2 style={{ fontFamily: "var(--f-display)", fontSize: 28, color: "var(--cloth)" }}>{lv}</h2>
          <div className="grid">
            {topics
              .filter((t) => t.level === lv)
              .map((t) => (
                <article key={t.key} id={t.key} className="card" style={{ scrollMarginTop: 24 }}>
                  <div className="row gap-8">
                    <b style={{ fontSize: 18 }}>{t.title}</b>
                    {counts[t.key] && <span className="chip brass">в разговорах: {counts[t.key].all}</span>}
                  </div>
                  <p style={{ lineHeight: 1.6 }}>{t.body}</p>
                  <div className="stack gap-6">
                    {t.examples.map(([o, tr]) => (
                      <div key={o}>
                        <span lang={langAttr} style={{ fontFamily: "var(--f-read)", fontWeight: 600 }}>
                          {o}
                        </span>
                        <br />
                        <span className="small muted">{tr}</span>
                      </div>
                    ))}
                  </div>
                  {t.bridge && (
                    <div className="small" style={{ background: "var(--cloth-soft)", borderRadius: 12, padding: "10px 12px" }}>
                      <b>Мостик из норвежского:</b> {t.bridge}
                    </div>
                  )}
                  <ExplainButton topicKey={t.key} />
                </article>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
