"use client";
/** «Набор дня» on the client: choosing a theme and length, and the interactive steps of a pack. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PackMinutes } from "@/lib/learning/packs";
import { htmlLang } from "@/lib/text-format";
import { speak } from "./audio";
import { ExplainButton } from "./ExplainButton";
import { Review, type ReviewCard } from "./Review";
import { track } from "./tracker";

const LENGTHS: { m: PackMinutes; label: string; note: string }[] = [
  { m: 15, label: "15 мин", note: "повторение и видео" },
  { m: 30, label: "30 мин", note: "+ слова и разговор" },
  { m: 45, label: "45 мин", note: "+ правило" },
];

export function PackPicker({ themes }: { themes: { key: string; title: string; reason: string; videos: number }[] }) {
  const router = useRouter();
  const [theme, setTheme] = useState(themes[0]?.key ?? "");
  const [minutes, setMinutes] = useState<PackMinutes>(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!themes.length) return <p className="small muted">Сегодня не нашлось материала для набора на этом языке.</p>;

  async function start() {
    setBusy(true);
    setErr("");
    track("pack.choose", { theme, minutes, offered: themes.map((t) => t.key) });
    const r = await fetch("/api/packs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme, minutes }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !d.id) {
      setBusy(false);
      setErr(d.error ?? "Не получилось. Попробуйте ещё раз.");
      return;
    }
    router.push(`/pack/${d.id}`);
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="pack-themes" role="radiogroup" aria-label="Тема набора">
        {themes.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={theme === t.key} className="pack-theme" onClick={() => setTheme(t.key)}>
            <b>{t.title}</b>
            <span className="small muted">{t.reason || `видео: ${t.videos}`}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div className="chips" role="group" aria-label="Сколько времени">
          {LENGTHS.map((l) => (
            <button key={l.m} type="button" aria-pressed={minutes === l.m} title={l.note} onClick={() => setMinutes(l.m)}>
              {l.label}
            </button>
          ))}
        </div>
        <span className="small muted">{LENGTHS.find((l) => l.m === minutes)?.note}</span>
        <button type="button" className="btn ml-auto" disabled={busy || !theme} onClick={start}>
          {busy ? "Собираю набор…" : "Начать набор"}
        </button>
      </div>
      {err && <p className="small error">{err}</p>}
    </div>
  );
}

/** Warm-up: today's review cards for this pack; the page refreshes its steps when the last one is graded. */
export function PackWarmup({ lang, cards, packId }: { lang: "no" | "en"; cards: ReviewCard[]; packId: string }) {
  const router = useRouter();
  return <Review lang={lang} cards={cards} onFinished={() => (track("pack.step", { packId, step: "warmup" }), router.refresh())} />;
}

export interface PackWordItem {
  lemma: string;
  display: string;
  translation: string;
  level: string;
  status: "known" | "learning" | "new";
}

/** Key words of the pack: listen, then «Знаю» or «Учить». Marks go into the pack's basket. */
export function PackWords({ lang, packId, words }: { lang: "no" | "en"; packId: string; words: PackWordItem[] }) {
  const router = useRouter();
  const [state, setState] = useState(() => new Map(words.map((w) => [w.lemma, w.status])));
  const [busy, setBusy] = useState<string | null>(null);
  async function mark(lemma: string, status: "known" | "learning") {
    setBusy(lemma);
    track("pack.word_mark", { packId, lemma, status });
    const r = await fetch("/api/wordmap/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, lemmas: [lemma], status, packId }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return;
    setState((m) => new Map(m).set(lemma, status));
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      {words.map((w) => {
        const st = state.get(w.lemma) ?? "new";
        return (
          <div key={w.lemma} className={`pack-word st-${st}`}>
            <button type="button" className="linkish" lang={htmlLang(lang)} onClick={() => (track("pack.word_listen", { packId, lemma: w.lemma }), speak(w.display, lang, { rate: 0.85 }))} title="Слушать">
              ▶ {w.display}
            </button>
            <span className="small muted">{w.translation}</span>
            <span className="chip">{w.level}</span>
            <span className="ml-auto row" style={{ gap: 6 }}>
              {st === "new" ? (
                <>
                  <button type="button" className="btn soft small" disabled={busy === w.lemma} onClick={() => mark(w.lemma, "known")}>
                    Знаю
                  </button>
                  <button type="button" className="btn small" disabled={busy === w.lemma} onClick={() => mark(w.lemma, "learning")}>
                    Учить
                  </button>
                </>
              ) : (
                <span className="small strong">{st === "known" ? "знаю ✓" : "в повторении ✓"}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The rule of the day: the explanation and an exercise; loading it marks the step done. */
export function PackRule({ packId, topicKey, done }: { packId: string; topicKey: string; done: boolean }) {
  const router = useRouter();
  return (
    <ExplainButton
      topicKey={topicKey}
      onExplained={() => {
        if (done) return;
        track("pack.step", { packId, step: "rule" });
        void fetch(`/api/packs/${packId}/rule`, { method: "POST" }).then(() => router.refresh());
      }}
    />
  );
}

export function PackActions({ packId, allDone }: { packId: string; allDone: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(action: "finish" | "cancel") {
    if (action === "finish" && !allDone && !window.confirm("Не все шаги сделаны. Подвести итог сейчас?")) return;
    if (action === "cancel" && !window.confirm("Отменить этот набор? Сохранённые слова останутся.")) return;
    setBusy(true);
    setErr("");
    track(`pack.${action}_click`, { packId, allDone });
    const r = await fetch(`/api/packs/${packId}/${action}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setErr("Не получилось. Попробуйте ещё раз.");
      return;
    }
    if (action === "cancel") router.push("/");
    else router.refresh();
  }
  return (
    <div className="row" style={{ gap: 10 }}>
      <button type="button" className="btn" disabled={busy} onClick={() => act("finish")}>
        {busy ? "Считаю итог…" : "Подвести итог дня"}
      </button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={() => act("cancel")}>
        Отменить набор
      </button>
      {err && <span className="small error">{err}</span>}
    </div>
  );
}
