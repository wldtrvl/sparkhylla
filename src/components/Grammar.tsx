"use client";
/** Grammar on the client: checked practice for a rule, the sentence builder, and «Мои заметки». */
import { useMemo, useState } from "react";
import { checkAnswer } from "@/lib/learning/answer";
import { ROLE_LABEL, sentenceOf, type Role, type Variation } from "@/lib/learning/sentences";
import { htmlLang } from "@/lib/text-format";
import { speak } from "./audio";
import { track } from "./tracker";

/** A stable shuffle (the same order on the server render and in the browser), never the solution itself. */
function shuffled<T>(xs: T[], seed: string): T[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a.every((x, i) => x === xs[i])) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

const endMark = (s: string) => s.match(/[.?!]$/)?.[0] ?? "";
const stripEnd = (s: string) => s.replace(/[.?!]$/, "");
// the first chunk is shown in lower case so the capital letter does not give the answer away
const lowerFirst = (s: string) => (/^(I|I'm|I'll)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** «Собери сама»: tap the parts in the right order. `parts` is the solution; `onDone(correct)` after checking. */
export function SentenceBuilder({ parts, lang, seed, onDone }: { parts: string[]; lang: "no" | "en"; seed: string; onDone?: (correct: boolean) => void }) {
  const mark = endMark(parts[parts.length - 1] ?? "");
  const solution = useMemo(() => parts.map((p, i) => (i === parts.length - 1 ? stripEnd(p) : p).replace(/,$/, "")), [parts]);
  const pool = useMemo(() => shuffled(solution.map((t, i) => ({ t: i === 0 ? lowerFirst(t) : t, i })), seed), [solution, seed]);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const done = picked.length === solution.length;

  function check() {
    const ok = picked.every((idx, pos) => solution[idx] === solution[pos]);
    setResult(ok ? "right" : "wrong");
    onDone?.(ok);
  }

  return (
    <div className="builder" lang={htmlLang(lang)}>
      <div className="builder-line" aria-label="Ваше предложение">
        {picked.length ? (
          picked.map((idx, pos) => (
            <button key={pos} type="button" className="builder-chip in" disabled={!!result} onClick={() => setPicked((p) => p.filter((_, k) => k !== pos))}>
              {pos === 0 ? solution[idx].charAt(0).toUpperCase() + solution[idx].slice(1) : pool.find((x) => x.i === idx)!.t}
            </button>
          ))
        ) : (
          <span className="small muted">Нажимайте на части по порядку…</span>
        )}
        {done && <span className="builder-mark">{mark}</span>}
      </div>
      <div className="builder-pool">
        {pool.map((x) => (
          <button key={x.i} type="button" className="builder-chip" disabled={picked.includes(x.i) || !!result} onClick={() => setPicked((p) => [...p, x.i])}>
            {x.t}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {!result ? (
          <>
            <button type="button" className="btn small" disabled={!done} onClick={check}>
              Проверить
            </button>
            {picked.length > 0 && (
              <button type="button" className="btn ghost small" onClick={() => setPicked([])}>
                Сначала
              </button>
            )}
          </>
        ) : result === "right" ? (
          <span className="strong" style={{ color: "var(--ok)" }}>
            Верно!
          </span>
        ) : (
          <span className="small">
            <b style={{ color: "var(--oxblood)" }}>Не совсем.</b> Правильно: <b>{solution.join(" ") + mark}</b>{" "}
            <button type="button" className="linkish" onClick={() => (setPicked([]), setResult(null))}>
              ещё раз
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

type DrillItem =
  | { type: "choose"; sentence: string; options: string[]; answer: string; ru: string }
  | { type: "order"; sentence: string; ru: string }
  | { type: "fix"; wrong: string; right: string; ru: string; personal?: boolean };

/** Checked practice for one rule: her own mistakes first, then fresh exercises. `onComplete` when all are answered. */
export function GrammarDrill({ ruleKey, lang, onComplete }: { ruleKey: string; lang: "no" | "en"; onComplete?: (score: { right: number; total: number }) => void }) {
  const [items, setItems] = useState<DrillItem[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const langAttr = htmlLang(lang);

  async function load() {
    setBusy(true);
    setErr("");
    setAnswers({});
    track("grammar.drill_start", { key: ruleKey });
    const r = await fetch("/api/grammar/drill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: ruleKey }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error ?? "Не получилось загрузить упражнения.");
    setItems(d.items);
  }

  function answer(i: number, item: DrillItem, correct: boolean) {
    if (i in answers) return;
    const next = { ...answers, [i]: correct };
    setAnswers(next);
    track("grammar.answer", { key: ruleKey, type: item.type, correct, personal: item.type === "fix" && !!item.personal });
    if (items && Object.keys(next).length === items.length) {
      const right = Object.values(next).filter(Boolean).length;
      track("grammar.drill_done", { key: ruleKey, right, total: items.length });
      onComplete?.({ right, total: items.length });
    }
  }

  if (!items)
    return (
      <div className="stack" style={{ gap: 8 }}>
        <button type="button" className="btn self-start" disabled={busy} onClick={load}>
          {busy ? "Готовлю упражнения…" : "Потренироваться"}
        </button>
        {err && <span className="small error">{err}</span>}
      </div>
    );

  const right = Object.values(answers).filter(Boolean).length;
  const total = items.length;
  return (
    <div className="stack" style={{ gap: 14 }}>
      {items.map((it, i) => (
        <div key={i} className={`drill-item${i in answers ? (answers[i] ? " ok" : " no") : ""}`}>
          <span className="eyebrow">
            {i + 1}. {it.type === "choose" ? "Выберите" : it.type === "order" ? "Соберите предложение" : it.type === "fix" && it.personal ? "Ваша фраза — исправьте ошибку" : "Исправьте ошибку"}
          </span>
          {it.type === "choose" && <ChooseItem item={it} lang={lang} onAnswer={(c) => answer(i, it, c)} />}
          {it.type === "order" && (
            <>
              <span className="small muted">{it.ru}</span>
              <SentenceBuilder parts={it.sentence.split(/\s+/)} lang={lang} seed={`${ruleKey}:${i}:${it.sentence}`} onDone={(c) => answer(i, it, c)} />
            </>
          )}
          {it.type === "fix" && <FixItem item={it} lang={langAttr} onAnswer={(c) => answer(i, it, c)} />}
        </div>
      ))}
      <div className="row" style={{ gap: 10 }}>
        <span className="strong">
          Верно: {right} из {Object.keys(answers).length}
          {Object.keys(answers).length === total ? " — готово!" : ""}
        </span>
        {Object.keys(answers).length === total && (
          <button type="button" className="btn soft small" onClick={load}>
            Новые упражнения
          </button>
        )}
      </div>
    </div>
  );
}

function ChooseItem({ item, lang, onAnswer }: { item: Extract<DrillItem, { type: "choose" }>; lang: "no" | "en"; onAnswer: (correct: boolean) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [before, after] = item.sentence.split("___");
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="drill-sentence" lang={htmlLang(lang)}>
        {before}
        <span className="drill-gap">{chosen ?? "…"}</span>
        {after}
      </p>
      <span className="small muted">{item.ru}</span>
      <div className="chips">
        {item.options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={chosen === o}
            disabled={!!chosen}
            className={chosen && o === item.answer ? "drill-right" : chosen === o ? "drill-wrong" : undefined}
            onClick={() => (setChosen(o), onAnswer(o === item.answer))}
          >
            {o}
          </button>
        ))}
      </div>
      {chosen && chosen !== item.answer && (
        <span className="small">
          Правильно: <b>{item.answer}</b>
        </span>
      )}
    </div>
  );
}

function FixItem({ item, lang, onAnswer }: { item: Extract<DrillItem, { type: "fix" }>; lang: string; onAnswer: (correct: boolean) => void }) {
  const [text, setText] = useState(item.wrong);
  const [verdict, setVerdict] = useState<"correct" | "close" | "wrong" | null>(null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="drill-sentence" lang={lang} style={{ textDecoration: verdict ? "none" : undefined }}>
        <span className="muted">{item.wrong}</span>
      </p>
      <span className="small muted">{item.ru}</span>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" lang={lang} value={text} disabled={!!verdict} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label="Исправленное предложение" />
        {!verdict && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const v = checkAnswer(text, item.right);
              setVerdict(v);
              onAnswer(v !== "wrong");
            }}
          >
            Проверить
          </button>
        )}
      </div>
      {verdict && (
        <span className="small">
          {verdict === "correct" ? <b style={{ color: "var(--ok)" }}>Верно!</b> : verdict === "close" ? <b style={{ color: "var(--brass-ink)" }}>Почти!</b> : <b style={{ color: "var(--oxblood)" }}>Не совсем.</b>}{" "}
          {verdict !== "correct" && (
            <>
              Правильно: <b lang={lang}>{item.right}</b>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** One variation of a sentence pattern: coloured parts, listen, and «Собери сама». */
export function PatternVariation({ v, lang, seed }: { v: Variation; lang: "no" | "en"; seed: string }) {
  const [build, setBuild] = useState(false);
  const text = sentenceOf(v);
  return (
    <div className="pattern-row">
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <span className="eyebrow pattern-label">
          {v.label}
        </span>
        <span className="pattern-parts" lang={htmlLang(lang)}>
          {v.parts.map(([t, r], i) => (
            <span key={i} className={`part role-${r}`} title={ROLE_LABEL[r as Role]}>
              {t}
            </span>
          ))}
        </span>
      </div>
      <div className="row pattern-indent" style={{ gap: 8 }}>
        <span className="small muted">{v.ru}</span>
        <span className="ml-auto row" style={{ gap: 6 }}>
          <button type="button" className="btn ghost small" onClick={() => (track("grammar.pattern_listen", { seed }), speak(text, lang, { rate: 0.85 }))}>
            ▶ Слушать
          </button>
          <button type="button" className="btn ghost small" aria-pressed={build} onClick={() => (track("grammar.pattern_build_open", { seed }), setBuild(!build))}>
            Собери сама
          </button>
        </span>
      </div>
      {v.note && (
        <span className="small pattern-indent" style={{ color: "var(--brass-ink)" }}>
          {v.note}
        </span>
      )}
      {build && (
        <div className="pattern-indent">
          <SentenceBuilder parts={v.parts.map(([t]) => t)} lang={lang} seed={seed} onDone={(ok) => track("grammar.pattern_build", { seed, correct: ok })} />
        </div>
      )}
    </div>
  );
}

/** Keep a rule or pattern in «Мои заметки», with her own comment. */
export function NoteButton({ lang, kind, refKey, saved, body }: { lang: "no" | "en"; kind: "rule" | "pattern"; refKey: string; saved: boolean; body: string }) {
  const [isSaved, setSaved] = useState(saved);
  const [text, setText] = useState(body);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, kind, ref: refKey, body: text }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setSaved(true);
      setOpen(false);
    }
  }
  async function remove() {
    setBusy(true);
    const r = await fetch("/api/notes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ref: refKey }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setSaved(false);
      setText("");
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className={isSaved ? "btn soft small" : "btn small"} disabled={busy} onClick={() => (isSaved ? setOpen(!open) : (setOpen(true), void 0))}>
          {isSaved ? "★ В моих заметках" : "☆ В мои заметки"}
        </button>
        {isSaved && (
          <button type="button" className="btn ghost small" disabled={busy} onClick={remove}>
            Убрать
          </button>
        )}
      </div>
      {open && (
        <div className="stack" style={{ gap: 6 }}>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваш комментарий: что запомнить, пример из жизни…" />
          <button type="button" className="btn small self-start" disabled={busy} onClick={save}>
            Сохранить заметку
          </button>
        </div>
      )}
    </div>
  );
}
