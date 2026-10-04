"use client";
import { useEffect, useRef, useState } from "react";
import { checkAnswer, type Verdict } from "@/lib/learning/answer";
import { sendForTranscript, speak, useRecorder } from "./audio";
import { RecLevel } from "./RecLevel";
import { track } from "./tracker";
import { htmlLang } from "@/lib/text-format";

type Answer = "forgot" | "hard" | "good";

export interface ReviewCard {
  id: string;
  term: string;
  lemma: string | null;
  translation: string | null;
  context: string | null;
  note: string | null;
  kind: string;
}

function gapped(context: string | null, term: string) {
  if (!context) return null;
  const i = context.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return null;
  return { before: context.slice(0, i), after: context.slice(i + term.length) };
}

export function Review({ lang, cards }: { lang: "no" | "en"; cards: ReviewCard[] }) {
  const [queue, setQueue] = useState(cards);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [gaveUp, setGaveUp] = useState(false); // "Не помню" before answering: show the word, then grade as forgot
  const [mode, setMode] = useState<"typed" | "voice" | "button">("button");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const shownAt = useRef(0);
  const rec = useRecorder();
  const langAttr = htmlLang(lang);
  const card = queue[i];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [i]);

  // The app suggests a grade from her answer (she can still pick another): correct → «Вспомнила»,
  // close → «С трудом», wrong or «Не помню» → «Не вспомнила». Keys 1/2/3 grade; Enter takes the suggestion.
  const suggested: Answer | null = gaveUp ? "forgot" : verdict === "correct" ? "good" : verdict === "close" ? "hard" : verdict === "wrong" ? "forgot" : null;
  useEffect(() => {
    if (!revealed || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(e.target.tagName)) return;
      const byKey: Record<string, Answer> = { "1": "forgot", "2": "hard", "3": "good" };
      const a = e.key === "Enter" ? suggested : byKey[e.key];
      if (!a || (gaveUp && a !== "forgot")) return;
      e.preventDefault();
      choose(a, "key");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!queue.length)
    return (
      <div className="card" style={{ padding: 32 }}>
        <span className="eyebrow">Повторение</span>
        <h2 className="h2">На сегодня всё повторено</h2>
        <p className="muted">Слова вернутся сами, когда их пора будет повторить. Новые слова сохраняйте, когда читаете.</p>
      </div>
    );

  if (!card)
    return (
      <div className="card" style={{ padding: 32 }}>
        <span className="eyebrow">Готово</span>
        <h2 className="display" style={{ fontSize: 40 }}>
          Повторено: {queue.length}
        </h2>
        <p className="muted">Отличная работа. Теперь можно почитать или поговорить.</p>
      </div>
    );

  const g = gapped(card.context, card.term);

  function check(text: string, how: "typed" | "voice") {
    setGiven(text);
    setMode(how);
    const v = checkAnswer(text, card.term);
    setVerdict(v);
    setRevealed(true);
    speak(card.term, lang, { rate: 0.85 });
  }

  async function voice() {
    if (rec.recording) {
      const r = await rec.stop();
      if (!r) return setMsg("Не расслышала. Нажмите и скажите ещё раз.");
      setBusy(true);
      try {
        check(await sendForTranscript(r, lang, "review"), "voice");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusy(false);
      }
    } else {
      setMsg("");
      await rec.start();
    }
  }

  function giveUp() {
    track("review.gave_up", { wordId: card.id });
    setGaveUp(true);
    setRevealed(true);
    setMsg("");
    speak(card.term, lang, { rate: 0.85 });
  }

  function choose(answer: Answer, via: "click" | "key") {
    track("review.self_grade", { verdict, suggested, chosen: answer, via, gaveUp });
    grade(answer);
  }

  async function grade(answer: Answer) {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wordId: card.id, answer, mode, given: given || undefined, elapsedMs: Date.now() - shownAt.current }),
    }).catch(() => null);
    if (!r?.ok) {
      track("review.save_failed", { wordId: card.id, status: r?.status ?? null });
      setMsg("Ответ не сохранился — проверьте интернет и нажмите ещё раз.");
      setBusy(false);
      return;
    }
    // a forgotten card comes back once more at the end of today's session
    if (answer === "forgot" && queue.filter((c) => c.id === card.id).length < 2) setQueue((q) => [...q, card]);
    setI((x) => x + 1);
    setGiven("");
    setVerdict(null);
    setRevealed(false);
    setGaveUp(false);
    setMode("button");
    setBusy(false);
  }

  return (
    <div className="card" style={{ padding: "28px 30px", gap: 18 }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <span className="small muted num">
          {i + 1} / {queue.length}
        </span>
        <div className="progress" style={{ flex: 1 }}>
          <i style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
      </div>
      <span className="eyebrow">{g ? "Какое слово пропущено?" : `Как это будет ${lang === "no" ? "по-норвежски" : "по-английски"}?`}</span>
      {g ? (
        <div lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 28, lineHeight: 1.55 }}>
          {g.before}
          {revealed ? <b style={{ color: "var(--cloth)" }}>{card.term}</b> : <span style={{ display: "inline-block", minWidth: "4.5em", borderBottom: "2px solid var(--cloth)" }}>&#8203;</span>}
          {g.after}
        </div>
      ) : (
        <div style={{ fontSize: 26 }}>{card.translation}</div>
      )}
      {g && card.translation && (
        <div className="muted">
          Подсказка: <b style={{ color: "var(--ink)" }}>{card.translation}</b>
        </div>
      )}

      {!revealed ? (
        <>
          <div className="row gap-18">
            <button type="button" className={`mic${rec.recording ? " rec" : ""}`} aria-label={rec.recording ? "Остановить запись" : "Ответить голосом"} onClick={voice} disabled={busy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <form
              className="field"
              style={{ flex: 1, minWidth: 200 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (given.trim()) check(given, "typed");
              }}
            >
              <label htmlFor="answer">{rec.recording ? "Говорите… нажмите на микрофон ещё раз, чтобы закончить" : "Скажите вслух или напечатайте"}</label>
              <input id="answer" className="input" lang={langAttr} autoComplete="off" value={given} onChange={(e) => setGiven(e.target.value)} placeholder="ваш ответ…" />
            </form>
          </div>
          {rec.recording && <RecLevel level={rec.level} seconds={rec.seconds} />}
          {(msg || rec.error) && <p className="error">{msg || rec.error}</p>}
          <div className="row">
            <button type="button" className="btn ghost" onClick={giveUp} disabled={busy}>
              Не помню
            </button>
            <button type="button" className="btn soft" onClick={() => (given.trim() ? check(given, "typed") : (setRevealed(true), speak(card.term, lang, { rate: 0.85 })))} disabled={busy}>
              {given.trim() ? "Проверить" : "Показать ответ"}
            </button>
          </div>
        </>
      ) : (
        <>
          {verdict && (
            <div className={verdict === "wrong" ? "notice" : "chip ok"} style={{ alignSelf: "flex-start", fontSize: 16, padding: "8px 14px" }}>
              {verdict === "correct" && <>Верно! «{given}»</>}
              {verdict === "close" && <>Почти: «{given}». Правильно — <b lang={langAttr}>{card.term}</b></>}
              {verdict === "wrong" && <>Вы сказали «{given}». Правильно — <b lang={langAttr}>{card.term}</b></>}
            </div>
          )}
          {!g && (
            <div lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 28, color: "var(--cloth)", fontWeight: 600 }}>
              {card.term}
            </div>
          )}
          {card.note && <span className="small muted">{card.note}</span>}
          <div className="row">
            <button type="button" className="btn soft small" onClick={() => speak(card.context ?? card.term, lang, { rate: 0.85 })}>
              Слушать
            </button>
          </div>
          {msg && <p className="error">{msg}</p>}
          {gaveUp ? (
            <div className="row">
              <button type="button" className="btn suggested" onClick={() => choose("forgot", "click")} disabled={busy}>
                Запомнила, дальше <kbd className="key-hint">Enter</kbd>
              </button>
            </div>
          ) : (
          <div className="row">
            <button type="button" className={`btn ghost${suggested === "forgot" ? " suggested" : ""}`} onClick={() => choose("forgot", "click")} disabled={busy}>
              <kbd className="key-hint">1</kbd> Не вспомнила
            </button>
            <button type="button" className={`btn soft${suggested === "hard" ? " suggested" : ""}`} onClick={() => choose("hard", "click")} disabled={busy}>
              <kbd className="key-hint">2</kbd> С трудом
            </button>
            <button type="button" className={`btn${suggested === "good" ? " suggested" : ""}`} onClick={() => choose("good", "click")} disabled={busy}>
              <kbd className="key-hint">3</kbd> Вспомнила
            </button>
          </div>
          )}
        </>
      )}
    </div>
  );
}
