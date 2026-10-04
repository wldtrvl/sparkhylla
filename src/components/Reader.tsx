"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { htmlLang, isHeading, paragraphText, splitSentences, WORD_PATTERN } from "@/lib/text-format";
import { speak, speakToEnd, stopAudio, ttsUrl } from "./audio";
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

const WORD = new RegExp(WORD_PATTERN.source, "gu");

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

/** A reading preference kept in this browser across pages (the reader remounts on every page turn). */
function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(`flag:${key}`, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(`flag:${key}`, onChange);
      };
    },
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = (v: boolean) => {
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* private mode: the flag lasts until the page reloads */
    }
    window.dispatchEvent(new Event(`flag:${key}`));
  };
  return [value, set];
}

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
  const langAttr = htmlLang(props.lang);

  const texts = useMemo(() => props.paragraphs.map(paragraphText), [props.paragraphs]);
  const paras = useMemo(() => texts.map(pieces), [texts]);
  // «Перевод рядом»: each paragraph's sentences with their translation, fetched on request
  const sentences = useMemo(() => props.paragraphs.map((p, i) => (isHeading(p) ? [texts[i]] : splitSentences(texts[i]))), [props.paragraphs, texts]);
  const [split, setSplit] = useStoredFlag("sh_split");
  const [hideTr, setHideTr] = useStoredFlag("sh_split_hide");
  const [tr, setTr] = useState<string[][] | null>(null);
  const [trState, setTrState] = useState<"idle" | "loading" | "error">("idle");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [speaking, setSpeaking] = useState<number | null>(null); // paragraph being read aloud
  const [phrase, setPhrase] = useState<{ text: string; para: number; x: number; y: number } | null>(null);
  const glossRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // desktop: the translation opens as a card under (or above) the tapped word; phones: a bottom sheet
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  // Escape or a click outside closes the translation; leaving the page stops reading aloud
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && !t.closest(".gloss, .w, .phrase-btn") && !window.getSelection()?.toString().trim()) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      stopAudio();
    };
  }, []);

  // Touch screens: selecting 2–8 words shows a «Перевести фразу» button next to the selection.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = window.getSelection();
        const text = s?.toString().trim().replace(/\s+/g, " ") ?? "";
        const n = text ? text.split(" ").length : 0;
        const host = s?.anchorNode?.parentElement?.closest<HTMLElement>("[data-p]");
        if (!s || !host || n < 2 || n > 8 || !s.rangeCount) return setPhrase(null);
        const r = s.getRangeAt(0).getBoundingClientRect();
        setPhrase({ text, para: Number(host.dataset.p), x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90), y: r.bottom + 10 });
      }, 350);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, []);

  // On a phone the translation opens as a sheet at the bottom: keep the tapped word visible above it.
  useEffect(() => {
    if (!sel || !glossRef.current || !window.matchMedia("(max-width: 860px)").matches) return;
    const word = document.querySelector(`[data-k="${CSS.escape(sel.key)}"]`);
    const sheetTop = glossRef.current.getBoundingClientRect().top;
    const b = word?.getBoundingClientRect();
    if (b && b.bottom > sheetTop - 12) window.scrollBy({ top: b.bottom - sheetTop + 48, behavior: "smooth" });
  }, [sel, gloss]);

  /** Read the page aloud from paragraph `from`, highlighting each one; the next paragraph's audio is fetched meanwhile. */
  async function readAloud(from: number) {
    track("read.listen_page", { textId: props.textId, from });
    for (let i = from; i < texts.length; i++) {
      setSpeaking(i);
      const next = texts.slice(i + 1).find(Boolean);
      if (next) void ttsUrl(next, props.lang);
      if (!(await speakToEnd(texts[i], props.lang))) return; // stopped
    }
    setSpeaking(null);
  }

  async function loadTranslations() {
    setTrState("loading");
    const flat = sentences.flat();
    try {
      const r = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: props.lang, textId: props.textId, sentences: flat }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      let k = 0;
      setTr(sentences.map((ss) => ss.map(() => (d.translations as string[])[k++] ?? "")));
      setTrState("idle");
    } catch {
      setTrState("error");
    }
  }

  // translate the page when the split view is on (also after a page turn) and nothing is loaded yet
  useEffect(() => {
    if (split && !tr && trState === "idle") void Promise.resolve().then(loadTranslations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split]);

  function stopReading() {
    stopAudio();
    setSpeaking(null);
  }

  function placeNear(anchor: DOMRect | undefined) {
    const root = rootRef.current?.getBoundingClientRect();
    if (!anchor || !root || window.matchMedia("(max-width: 860px)").matches) return setPos(null);
    const width = Math.min(380, root.width);
    const left = Math.min(Math.max(anchor.left - root.left - 24, 0), root.width - width);
    const above = window.innerHeight - anchor.bottom < 340 && anchor.top > 340;
    setPos({ left, above, top: above ? anchor.top - root.top - 10 : anchor.bottom - root.top + 10 });
  }

  async function open(term: string, paragraph: string, key: string, anchor?: DOMRect) {
    const sentence = sentenceAround(paragraph, term);
    placeNear(anchor ?? document.querySelector(`[data-k="${CSS.escape(key)}"]`)?.getBoundingClientRect());
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
    const sel = window.getSelection();
    const s = sel?.toString().trim() ?? "";
    if (s && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 8) open(s, paragraph, `sel:${s}`, sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : undefined);
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

  const words = (ps: { t: string; word: boolean }[], i: number, prefix: string) =>
    ps.map((x, j) => {
      if (!x.word) return <span key={j}>{x.t}</span>;
      const n = norm(x.t);
      const key = `${prefix}${j}`;
      const isUnknown = unknown.has(n);
      const cls = ["w", isUnknown ? "unknown" : "", learning.has(n) ? "learning" : "", sel?.key === key ? "selected" : ""].join(" ");
      return (
        <span
          key={j}
          data-k={key}
          className={cls}
          role={isUnknown ? "button" : undefined}
          tabIndex={isUnknown ? 0 : undefined}
          onClick={(e) => window.getSelection()?.toString().trim().includes(" ") || open(x.t, texts[i], key, e.currentTarget.getBoundingClientRect())}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(x.t, texts[i], key, e.currentTarget.getBoundingClientRect()))}
        >
          {x.t}
        </span>
      );
    });

  return (
    <div className="reader" ref={rootRef}>
      <div className="row listen-bar">
        {speaking == null ? (
          <button type="button" className="btn soft small" onClick={() => readAloud(0)}>
            ▶ Слушать страницу
          </button>
        ) : (
          <button type="button" className="btn small" onClick={stopReading}>
            ■ Остановить
          </button>
        )}
        <button
          type="button"
          className="btn soft small"
          aria-pressed={split}
          onClick={() => {
            track("read.split_toggle", { on: !split, textId: props.textId });
            setSplit(!split);
          }}
        >
          ⇆ Перевод рядом
        </button>
        {split && (
          <button
            type="button"
            className="btn soft small"
            aria-pressed={hideTr}
            onClick={() => {
              track("read.split_hide", { on: !hideTr, textId: props.textId });
              setHideTr(!hideTr);
            }}
          >
            {hideTr ? "Показывать перевод" : "Прятать перевод"}
          </button>
        )}
        <span className="small muted reader-tip">
          Нажмите на <span className="w unknown">выделенное</span> слово — появится перевод. Фразу можно выделить.
        </span>
      </div>
      {split && trState === "error" && (
        <p className="error">
          Перевод не загрузился.{" "}
          <button type="button" className="btn soft small" onClick={() => loadTranslations()}>
            Попробовать ещё раз
          </button>
        </p>
      )}
      <div className={`prose${split ? " bilingual" : ""}`} lang={langAttr} style={{ fontSize: "var(--read-size, 21px)" }}>
        {paras.map((ps, i) => {
          const Tag = isHeading(props.paragraphs[i]) ? "h2" : "p";
          const listen =
            Tag === "p" ? (
              <button
                type="button"
                className="para-listen"
                aria-label="Слушать абзац"
                title="Слушать абзац"
                onClick={() => {
                  track("read.listen", { textId: props.textId, paragraph: i });
                  readAloud(i);
                }}
              >
                ▶
              </button>
            ) : null;
          if (!split)
            return (
              <div key={i} className={`para${speaking === i ? " speaking" : ""}`} data-p={i}>
                {listen}
                <Tag className={Tag === "h2" ? "prose-heading" : undefined} onMouseUp={() => onMouseUp(texts[i])}>
                  {words(ps, i, `${i}:`)}
                </Tag>
              </div>
            );
          return (
            <div key={i} className={`para bi-para${speaking === i ? " speaking" : ""}`} data-p={i}>
              {listen}
              {sentences[i].map((sentence, k) => {
                const rowKey = `${i}:${k}`;
                const shown = !hideTr || revealed.has(rowKey);
                const t = tr?.[i]?.[k];
                return (
                  <div key={k} className="bi-row">
                    <Tag className={Tag === "h2" ? "prose-heading" : "bi-src"} onMouseUp={() => onMouseUp(texts[i])}>
                      {words(pieces(sentence), i, `${i}:${k}:`)}
                    </Tag>
                    {shown ? (
                      <span className={`bi-tr${t ? "" : " pending"}`} lang="ru">
                        {t ?? (trState === "loading" ? "…" : "")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="bi-tr bi-reveal"
                        onClick={() => {
                          track("read.translation_reveal", { textId: props.textId, paragraph: i, sentence: k });
                          setRevealed((r) => new Set(r).add(rowKey));
                        }}
                      >
                        Показать перевод
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {phrase && (
        <button
          type="button"
          className="btn small phrase-btn"
          style={{ left: phrase.x, top: phrase.y }}
          onClick={() => {
            open(phrase.text, texts[phrase.para], `sel:${phrase.text}`, new DOMRect(phrase.x - 40, phrase.y - 30, 80, 20));
            window.getSelection()?.removeAllRanges();
            setPhrase(null);
          }}
        >
          Перевести фразу
        </button>
      )}

      {sel && (
          <div
            className={`card gloss${pos ? " popover" : ""}${pos?.above ? " above" : ""}`}
            style={pos ? { top: pos.top, left: pos.left } : undefined}
            ref={glossRef}
            aria-live="polite"
            role="dialog"
            aria-label={`Перевод: ${sel.term}`}
          >
            <div className="row" style={{ alignItems: "baseline", flexWrap: "nowrap" }}>
              <b lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 28, minWidth: 0, overflowWrap: "anywhere" }}>
                {sel.term}
              </b>
              <button type="button" className="btn soft small ml-auto" onClick={() => speak(sel.term, props.lang, { rate: 0.8 })}>
                Слушать
              </button>
              <button type="button" className="gloss-close" aria-label="Закрыть перевод" onClick={() => setSel(null)}>
                ×
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
                <span className="small muted gloss-sentence read-italic" lang={langAttr}>
                  «{sel.sentence}»
                </span>
                {err && state !== "error" && <span className="error">{err}</span>}
                <div className="row gap-8">
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
    </div>
  );
}
