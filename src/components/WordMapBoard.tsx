"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { WordStatus } from "@/lib/learning/wordmap";
import { POS_LABEL, THEMES, asPos, type Theme } from "@/lib/learning/wordmap";
import { htmlLang } from "@/lib/text-format";
import { speak } from "./audio";
import { track } from "./tracker";

export interface MapChip {
  lemma: string;
  display: string;
  translation: string;
  level: string;
  status: WordStatus;
}
export interface MapGroup {
  key: string;
  title: string;
  subtitle: string;
  words: MapChip[];
  /** trees view: the basic word the group hangs from (shown first, marked as the root) */
  root?: string;
}

interface Detail {
  lemma: string;
  display: string;
  pos: string;
  level: string;
  theme: string | null;
  translation: string | null;
  forms: string[];
  analogues: { text: string; level: string; note: string; lemma: string | null }[];
  root: { lemma: string; display: string; translation: string; level: string; status: WordStatus } | null;
  isRoot: boolean;
  branch: { lemma: string; display: string; translation: string; level: string; status: WordStatus }[];
}

const STATUS_LABEL: Record<WordStatus, string> = { known: "знаю", learning: "учу", new: "новое" };
// chips show the word without «å» / article; the panel shows the dictionary form
const short = (d: string) => d.replace(/^(å|en|ei|et|to)\s+/i, "");

export function WordMapBoard({ lang, groups, context }: { lang: "no" | "en"; groups: MapGroup[]; context: string }) {
  const router = useRouter();
  // marks made on this page, over the statuses the server sent (kept across router.refresh)
  const [over, setOver] = useState<Map<string, WordStatus>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const req = useRef(0);

  const statusOf = (lemma: string, fallback: WordStatus = "new") => over.get(lemma) ?? groups.flatMap((g) => g.words).find((w) => w.lemma === lemma)?.status ?? fallback;

  function show(lemma: string, from: string) {
    track("map.word_open", { lemma, lang, from, context });
    setOpen(lemma);
    setDetail(null);
    setError("");
    setLoading(true);
    const n = ++req.current;
    fetch(`/api/wordmap/word?lang=${lang}&lemma=${encodeURIComponent(lemma)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Detail) => n === req.current && setDetail(d))
      .catch(() => n === req.current && setError("Не загрузилось. Попробуйте ещё раз."))
      .finally(() => n === req.current && setLoading(false));
  }

  async function mark(lemmas: string[], status: "known" | "learning" | "none", where: string) {
    setBusy(where);
    setError("");
    track("map.mark", { lang, status, count: lemmas.length, where, context });
    const r = await fetch("/api/wordmap/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, lemmas, status }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setError("Не сохранилось. Попробуйте ещё раз.");
      return;
    }
    setOver((m) => {
      const next = new Map(m);
      for (const l of lemmas) {
        const cur = statusOf(l);
        // a group «Знаю» leaves words in review alone (the server does the same)
        if (status === "known" && lemmas.length > 1 && cur === "learning") continue;
        if (status === "none" && cur === "learning") continue;
        next.set(l, status === "none" ? "new" : status);
      }
      return next;
    });
    router.refresh(); // level and theme percentages
  }

  // Escape closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!groups.length) return <p className="muted">Здесь пока нет слов.</p>;
  const st = open ? statusOf(open) : "new";

  return (
    <>
      <div className="wm-legend small" aria-hidden="true">
        <span className="wm-chip st-known">знаю</span>
        <span className="wm-chip st-learning">учу</span>
        <span className="wm-chip st-new">новое</span>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {groups.map((g) => {
          const fresh = g.words.filter((w) => statusOf(w.lemma) === "new").map((w) => w.lemma);
          return (
            <section key={g.key} className="card wm-group">
              <div className="row" style={{ gap: 8 }}>
                <h2 className="h2" lang={g.root ? htmlLang(lang) : undefined}>
                  {g.title}
                </h2>
                {g.subtitle && <span className="small muted">{g.subtitle}</span>}
                {fresh.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost small ml-auto"
                    disabled={busy === g.key}
                    onClick={() => {
                      if (window.confirm(`Отметить ${fresh.length} слов этой группы как знакомые? С отдельных слов отметку можно потом снять.`)) void mark(fresh, "known", g.key);
                    }}
                  >
                    {busy === g.key ? "Сохраняю…" : `Знаю все (${fresh.length})`}
                  </button>
                )}
              </div>
              <div className="wm-chips" lang={htmlLang(lang)}>
                {g.words.map((w) => {
                  const s = statusOf(w.lemma, w.status);
                  return (
                    <button
                      key={w.lemma}
                      type="button"
                      className={`wm-chip st-${s}${g.root === w.lemma ? " is-root" : ""}`}
                      title={`${w.translation} · ${w.level} · ${STATUS_LABEL[s]}`}
                      aria-label={`${w.display} — ${w.translation}, ${STATUS_LABEL[s]}`}
                      onClick={() => show(w.lemma, g.key)}
                    >
                      {short(w.display)}
                      {g.key.startsWith("search") || g.root ? <small>{w.level}</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(null)} aria-hidden="true" />
          <div className="card wm-sheet" role="dialog" aria-label="Слово">
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <div className="stack" style={{ gap: 4, flex: 1 }}>
                <b className="title-read" lang={htmlLang(lang)}>
                  {detail?.display ?? open}
                </b>
                {detail && (
                  <span className="small muted">
                    {POS_LABEL[asPos(detail.pos)]} · {detail.level}
                    {detail.theme && detail.theme in THEMES ? ` · ${THEMES[detail.theme as Theme]}` : ""}
                  </span>
                )}
              </div>
              <button type="button" className="gloss-close" aria-label="Закрыть" onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
            {loading && <p className="muted">Загружаю…</p>}
            {error && <p className="small error">{error}</p>}
            {detail && (
              <>
                <p style={{ margin: 0, fontSize: 18 }}>{detail.translation}</p>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`wm-chip st-${st}`}>{STATUS_LABEL[st]}</span>
                  <button type="button" className="btn soft small" onClick={() => (track("map.listen", { lemma: detail.lemma, lang }), speak(detail.display, lang, { rate: 0.85 }))}>
                    Слушать
                  </button>
                  {st !== "known" && (
                    <button type="button" className="btn small" disabled={!!busy} onClick={() => void mark([detail.lemma], "known", "sheet")}>
                      Знаю
                    </button>
                  )}
                  {st === "known" && (
                    <button type="button" className="btn soft small" disabled={!!busy} onClick={() => void mark([detail.lemma], "none", "sheet")}>
                      Снять «знаю»
                    </button>
                  )}
                  {st !== "learning" ? (
                    <button type="button" className="btn soft small" disabled={!!busy} onClick={() => void mark([detail.lemma], "learning", "sheet")}>
                      Учить
                    </button>
                  ) : (
                    <Link href="/words" className="small">
                      в повторении →
                    </Link>
                  )}
                </div>
                {detail.forms.length > 1 && (
                  <p className="small muted" style={{ margin: 0 }} lang={htmlLang(lang)}>
                    Формы: {detail.forms.join(", ")}
                  </p>
                )}
                {detail.analogues.length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="eyebrow">Как ещё сказать</span>
                    {detail.analogues.map((a) => (
                      <div key={a.text} className="wm-analogue">
                        {a.lemma ? (
                          <button type="button" className="linkish" lang={htmlLang(lang)} onClick={() => show(a.lemma!, "analogue")}>
                            {a.text}
                          </button>
                        ) : (
                          <b lang={htmlLang(lang)}>{a.text}</b>
                        )}
                        <span className="chip">{a.level}</span>
                        <span className="small muted">{a.note}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(detail.root || detail.branch.length > 0) && (
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="eyebrow">{detail.isRoot ? "От этого слова" : "Ветка"}</span>
                    {detail.root && (
                      <span className="small">
                        Базовое слово:{" "}
                        <button type="button" className="linkish" lang={htmlLang(lang)} onClick={() => show(detail.root!.lemma, "root")}>
                          {detail.root.display}
                        </button>{" "}
                        <span className="muted">— {detail.root.translation}</span>
                      </span>
                    )}
                    <div className="wm-chips" lang={htmlLang(lang)}>
                      {detail.branch.map((b) => (
                        <button key={b.lemma} type="button" className={`wm-chip st-${statusOf(b.lemma, b.status)}`} title={b.translation} onClick={() => show(b.lemma, "branch")}>
                          {short(b.display)}
                          <small>{b.level}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
