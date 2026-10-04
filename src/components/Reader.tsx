"use client";
import { useMemo, useState } from "react";
import { speak } from "./audio";
import { track } from "./tracker";

type Lang = "no" | "en";

interface Gloss {
  lemma: string;
  translation: string;
  pos?: string;
  forms?: string;
  note?: string | null;
  norwegian?: string | null;
  is_phrase?: boolean;
}

const WORD = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

function pieces(p: string) {
  const out: { t: string; word: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(p))) {
    if (m.index > last) out.push({ t: p.slice(last, m.index), word: false });
    out.push({ t: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < p.length) out.push({ t: p.slice(last), word: false });
  return out;
}

function sentenceAround(paragraph: string, term: string): string {
  const parts = paragraph.split(/(?<=[.!?…»”])\s+/);
  const lt = term.toLowerCase();
  return (parts.find((s) => s.toLowerCase().includes(lt)) ?? paragraph).trim().slice(0, 600);
}

const norm = (w: string) => w.toLowerCase().replace(/’/g, "'");

export function Reader(props: {
  lang: Lang;
  textId?: string;
  source: string; // for saved words: "text:<id>" or "paste"
  paragraphs: string[];
  unknown: string[];
  learning: string[];
}) {
  const [unknown, setUnknown] = useState(() => new Set(props.unknown));
  const [learning, setLearning] = useState(() => new Set(props.learning));
  const [sel, setSel] = useState<{ term: string; sentence: string; key: string } | null>(null);
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<"" | "learning" | "known">("");
  const langAttr = props.lang === "no" ? "nb" : "en";

  const paras = useMemo(() => props.paragraphs.map(pieces), [props.paragraphs]);

  async function open(term: string, paragraph: string, key: string) {
    const sentence = sentenceAround(paragraph, term);
    setSel({ term, sentence, key });
    setGloss(null);
    setErr("");
    setSaved(learning.has(norm(term)) ? "learning" : "");
    setState("loading");
    track("word.tap", { term, unknown: unknown.has(norm(term)), textId: props.textId, phrase: term.includes(" ") });
    try {
      const r = await fetch("/api/gloss", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: props.lang, term, sentence, textId: props.textId }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setGloss(data.gloss);
      setState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setState("error");
    }
  }

  function onMouseUp(paragraph: string) {
    const s = window.getSelection()?.toString().trim() ?? "";
    if (s && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 8) open(s, paragraph, `sel:${s}`);
  }

  async function save(status: "learning" | "known") {
    if (!sel) return;
    setErr("");
    const r = await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lang: props.lang,
        term: sel.term,
        lemma: gloss?.lemma,
        translation: gloss?.translation,
        note: [gloss?.forms, gloss?.note, gloss?.norwegian ? `NO: ${gloss.norwegian}` : ""].filter(Boolean).join(" · ") || undefined,
        kind: sel.term.includes(" ") ? "phrase" : "word",
        status,
        context: sel.sentence,
        source: props.source,
      }),
    }).catch(() => null);
    if (!r?.ok) {
      track("word.save_failed", { term: sel.term, status: r?.status ?? null });
      setErr("Не сохранилось — проверьте интернет и нажмите ещё раз.");
      return;
    }
    setSaved(status);
    const n = norm(sel.term);
    setUnknown((u) => {
      const x = new Set(u);
      x.delete(n);
      return x;
    });
    if (status === "learning") setLearning((l) => new Set(l).add(n));
  }

  return (
    <div className="split">
      <div className="wide">
        <div className="prose" lang={langAttr} style={{ fontSize: "var(--read-size, 21px)" }}>
          {paras.map((ps, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <p onMouseUp={() => onMouseUp(props.paragraphs[i])}>
                {ps.map((x, j) => {
                  if (!x.word) return <span key={j}>{x.t}</span>;
                  const n = norm(x.t);
                  const key = `${i}:${j}`;
                  const cls = ["w", unknown.has(n) ? "unknown" : "", learning.has(n) ? "learning" : "", sel?.key === key ? "selected" : ""].join(" ");
                  const isUnknown = unknown.has(n);
                  return (
                    <span
                      key={j}
                      className={cls}
                      role={isUnknown ? "button" : undefined}
                      tabIndex={isUnknown ? 0 : undefined}
                      onClick={() => window.getSelection()?.toString().trim().includes(" ") || open(x.t, props.paragraphs[i], key)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(x.t, props.paragraphs[i], key))}
                    >
                      {x.t}
                    </span>
                  );
                })}
              </p>
              <div className="para-tools">
                <button
                  type="button"
                  className="btn soft small"
                  onClick={() => {
                    track("read.listen", { textId: props.textId, paragraph: i });
                    speak(props.paragraphs[i], props.lang);
                  }}
                >
                  Слушать абзац
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="side" style={{ position: "sticky", top: 24 }}>
        {!sel && (
          <div className="card">
            <span className="eyebrow">Как читать</span>
            <p className="small" style={{ lineHeight: 1.55 }}>
              <span className="w unknown">Выделены</span> слова, которых вы, скорее всего, ещё не знаете. Нажмите на любое слово — появится перевод. Чтобы спросить о фразе, выделите её мышкой.
            </p>
            <p className="small muted">Не нужно понимать каждое слово: главное — смысл.</p>
          </div>
        )}
        {sel && (
          <div className="card" aria-live="polite">
            <div className="row" style={{ alignItems: "baseline" }}>
              <b lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 28 }}>
                {sel.term}
              </b>
              <button type="button" className="btn soft small" style={{ marginLeft: "auto" }} onClick={() => speak(sel.term, props.lang, { rate: 0.8 })}>
                Слушать
              </button>
            </div>
            {state === "loading" && <span className="muted">Ищу значение…</span>}
            {state === "error" && <span className="error">{err}</span>}
            {gloss && (
              <>
                <span style={{ fontSize: 19 }}>{gloss.translation}</span>
                {gloss.lemma && gloss.lemma.toLowerCase() !== sel.term.toLowerCase() && (
                  <span className="small muted" lang={langAttr}>
                    Словарная форма: <b>{gloss.lemma}</b>
                    {gloss.pos ? ` · ${gloss.pos}` : ""}
                  </span>
                )}
                {gloss.forms && (
                  <span className="small" lang={langAttr}>
                    {gloss.forms}
                  </span>
                )}
                {gloss.norwegian && (
                  <span className="small" style={{ background: "var(--cloth-soft)", borderRadius: 10, padding: "8px 10px" }}>
                    По-норвежски: <b lang="nb">{gloss.norwegian}</b>
                  </span>
                )}
                {gloss.note && <span className="small muted">{gloss.note}</span>}
                <span className="small muted" lang={langAttr} style={{ fontFamily: "var(--f-read)", fontStyle: "italic" }}>
                  «{sel.sentence}»
                </span>
                {err && state !== "error" && <span className="error">{err}</span>}
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn" disabled={saved !== ""} onClick={() => save("learning")}>
                    {saved === "learning" ? "В моих словах" : "Сохранить"}
                  </button>
                  <button type="button" className="btn ghost" disabled={saved !== ""} onClick={() => save("known")}>
                    {saved === "known" ? "Отмечено" : "Я знаю"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
