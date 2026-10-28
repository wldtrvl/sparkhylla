import Link from "next/link";
import { notFound } from "next/navigation";
import { PackActions, PackRule, PackWarmup, PackWords, type PackWordItem } from "@/components/Pack";
import { PackResultCard, PackStepList } from "@/components/PackViews";
import type { ReviewCard } from "@/components/Review";
import { GRAMMAR } from "@/lib/learning/grammar";
import { STEP_LABEL, themeOf } from "@/lib/learning/packs";
import { statusIndex, statusOf } from "@/lib/learning/wordmap";
import { getPack, packState, packTalkGoal } from "@/lib/packs-data";
import { requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";
import { loadMap, ownWords } from "@/lib/wordmap-data";

const fmtDay = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Oslo" });

export default async function PackPage({ params }: PageProps<"/pack/[id]">) {
  const s = await requireSession();
  const { id } = await params;
  const pack = await getPack(s, id);
  if (!pack) notFound();
  const theme = themeOf(pack.theme);
  const header = (
    <div className="stack gap-4">
      <span className="eyebrow">
        Набор дня · {fmtDay.format(new Date(`${pack.day}T12:00:00Z`))} · {pack.minutes} мин · {pack.lang === "no" ? "Norsk" : "English"}
      </span>
      <h1 className="display">{theme?.title ?? pack.theme}</h1>
    </div>
  );

  if (pack.status !== "active") {
    return (
      <>
        <Link href="/" className="strong">
          ← Мой стол
        </Link>
        {header}
        <section className="card">
          <span className="eyebrow">{pack.status === "finished" ? "Итог набора" : "Набор отменён"}</span>
          {pack.results ? <PackResultCard pack={pack} results={pack.results} /> : <p className="muted">Итога нет.</p>}
        </section>
        <Link href="/pack" className="small">
          Все мои наборы →
        </Link>
      </>
    );
  }

  const state = await packState(s, pack);
  const done = new Map(state.steps.map((x) => [x.kind, x.done]));
  // warm-up cards still to review in this pack
  const toReview = pack.plan.warmup.wordIds.length && !done.get("warmup")
    ? ((await s.supabase.from("words").select("id,term,lemma,translation,context,note,kind,due").eq("user_id", s.user.id).in("id", pack.plan.warmup.wordIds).eq("status", "learning")).data ?? [])
    : [];
  const reviewed = new Set(
    toReview.length ? ((await s.supabase.from("reviews").select("word_id").eq("user_id", s.user.id).in("word_id", pack.plan.warmup.wordIds).gte("created_at", pack.started_at)).data ?? []).map((r) => r.word_id) : [],
  );
  const cards = toReview.filter((w) => !reviewed.has(w.id)) as ReviewCard[];
  // key words with her status
  let keyWords: PackWordItem[] = [];
  if (pack.plan.words.lemmas.length) {
    const [map, mine] = await Promise.all([loadMap(s.supabase, pack.lang), ownWords(s.supabase, s.user.id, pack.lang)]);
    const idx = statusIndex(mine);
    keyWords = pack.plan.words.lemmas
      .map((l) => map.byLemma.get(l))
      .filter((w) => !!w)
      .map((w) => ({ lemma: w.lemma, display: w.display, translation: w.translation, level: w.level, status: statusOf(w, idx) }));
  }
  const goal = pack.plan.talk ? await packTalkGoal(s, pack) : null;
  const rule = pack.plan.rule ? GRAMMAR.find((g) => g.key === pack.plan.rule!.key) : undefined;
  const langAttr = htmlLang(pack.lang);
  const stepCard = (kind: string, n: number, body: React.ReactNode) => (
    <section className={`card pack-step${done.get(kind as never) ? " is-done" : ""}`}>
      <div className="row" style={{ gap: 8 }}>
        <span className="pack-num">{done.get(kind as never) ? "✓" : n}</span>
        <h2 className="h2">{STEP_LABEL[kind as keyof typeof STEP_LABEL]}</h2>
      </div>
      {body}
    </section>
  );

  return (
    <>
      <Link href="/" className="strong">
        ← Мой стол
      </Link>
      {header}
      <div className="split">
        <div className="wide stack" style={{ gap: 16 }}>
          {pack.plan.steps.map((kind, i) => {
            const n = i + 1;
            if (kind === "warmup")
              return (
                <div key={kind}>
                  {stepCard(
                    kind,
                    n,
                    cards.length ? (
                      <PackWarmup lang={pack.lang} cards={cards} packId={pack.id} />
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>
                        {pack.plan.warmup.wordIds.length ? "Готово — слова повторены." : "Сегодня повторять нечего: слова из прошлых наборов ещё не подошли."}
                      </p>
                    ),
                  )}
                </div>
              );
            if (kind === "watch" && pack.plan.watch)
              return (
                <div key={kind}>
                  {stepCard(
                    kind,
                    n,
                    <>
                      <b className="title-read" lang={langAttr}>
                        {pack.plan.watch.title}
                      </b>
                      <span className="small muted">
                        около {Math.max(2, Math.round(pack.plan.watch.words / 130))} мин · знакомых слов {Math.round((pack.plan.watch.coverage ?? 0) * 100)}% · сохраняйте незнакомые слова — они попадут в корзину набора
                      </span>
                      <Link className="btn self-start" href={`/read/${pack.plan.watch.textId}?pack=${pack.id}`}>
                        {done.get("watch") ? "Посмотреть ещё раз" : "Смотреть"}
                      </Link>
                    </>,
                  )}
                </div>
              );
            if (kind === "words")
              return <div key={kind}>{stepCard(kind, n, <PackWords lang={pack.lang} packId={pack.id} words={keyWords} />)}</div>;
            if (kind === "talk" && pack.plan.talk)
              return (
                <div key={kind}>
                  {stepCard(
                    kind,
                    n,
                    <>
                      <b className="title-read">{pack.plan.talk.title}</b>
                      {goal && <span className="small">Дополнительная цель: {goal.ru.replace("Использовать 3 слова из набора: ", "используйте 3 слова — ")}</span>}
                      <Link className="btn self-start" href={`/talk/${pack.plan.talk.scenarioId}?pack=${pack.id}`}>
                        {done.get("talk") ? "Поговорить ещё раз" : "Начать разговор"}
                      </Link>
                    </>,
                  )}
                </div>
              );
            if (kind === "rule" && rule)
              return (
                <div key={kind}>
                  {stepCard(
                    kind,
                    n,
                    <>
                      <b>{rule.title}</b>
                      <p style={{ margin: 0 }}>{rule.body}</p>
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }} lang={langAttr}>
                        {rule.examples.map(([a, b]) => (
                          <li key={a}>
                            {a} <span className="muted">— {b}</span>
                          </li>
                        ))}
                      </ul>
                      <span className="small muted">Эту ошибку вы чаще всего делаете в разговорах. Разберите правило и упражнение:</span>
                      <PackRule packId={pack.id} topicKey={rule.key} done={!!done.get("rule")} />
                    </>,
                  )}
                </div>
              );
            return null;
          })}
          <PackActions packId={pack.id} allDone={state.allDone} />
        </div>
        <aside className="side stack" style={{ gap: 16 }}>
          <section className="card">
            <span className="eyebrow">Ход набора</span>
            <PackStepList steps={state.steps} />
          </section>
          <section className="card">
            <span className="eyebrow">Корзина набора · {state.basket.length}</span>
            {state.basket.length ? (
              <div className="chips" lang={langAttr}>
                {state.basket.map((w) => (
                  <span key={w.id} className={`wm-chip st-${w.status === "known" ? "known" : "learning"}`} title={w.translation ?? ""}>
                    {w.term}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Сюда попадают слова, которые вы сохраните в видео и отметите в «Словах набора».
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
