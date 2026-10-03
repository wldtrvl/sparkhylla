"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { speak } from "./audio";

export interface WordRow {
  id: string;
  term: string;
  translation: string | null;
  status: "learning" | "known" | "ignored";
  source: string | null;
  due: string | null;
  reps: number;
  created_at: string;
}

function dueLabel(due: string | null) {
  if (!due) return "—";
  const d = Math.ceil((Date.parse(due) - Date.now()) / 86_400_000);
  if (d <= 0) return "сегодня";
  if (d === 1) return "завтра";
  return `через ${d} дн.`;
}

export function WordList({ lang, words }: { lang: "no" | "en"; words: WordRow[] }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [tr, setTr] = useState("");
  const [ctx, setCtx] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const shown = useMemo(() => {
    const x = q.trim().toLowerCase();
    return words.filter((w) => w.status !== "ignored" && (!x || w.term.toLowerCase().includes(x) || (w.translation ?? "").toLowerCase().includes(x))).slice(0, 200);
  }, [q, words]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim() || !tr.trim()) return;
    setBusy(true);
    await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang, term: term.trim(), translation: tr.trim(), context: ctx.trim() || undefined, kind: term.trim().includes(" ") ? "phrase" : "word", source: "manual" }),
    });
    setTerm("");
    setTr("");
    setCtx("");
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <label htmlFor="q" className="eyebrow">
          Поиск по словарю
        </label>
        <input id="q" className="input" placeholder="слово или перевод" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Слово</th>
                <th>Повтор</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.id}>
                  <td>
                    <button type="button" onClick={() => speak(w.term, lang)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <b lang={lang === "no" ? "nb" : "en"} style={{ fontFamily: "var(--f-read)" }}>
                        {w.term}
                      </b>
                    </button>
                    <br />
                    <span className="small muted">{w.translation}</span>
                  </td>
                  <td className="small">{w.status === "known" ? "знаю" : dueLabel(w.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="small muted">Слов пока нет.</p>}
        </div>
      </div>
      <form className="card" onSubmit={add}>
        <b>Слово из жизни</b>
        <span className="small muted">Услышали на работе, в магазине, в письме? Запишите — оно попадёт в повторение.</span>
        <div className="field">
          <label htmlFor="t">Слово или фраза</label>
          <input id="t" className="input" lang={lang === "no" ? "nb" : "en"} value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tr">Перевод</label>
          <input id="tr" className="input" value={tr} onChange={(e) => setTr(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c">Пример (необязательно)</label>
          <input id="c" className="input" lang={lang === "no" ? "nb" : "en"} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        </div>
        <button className="btn soft" type="submit" disabled={busy}>
          Добавить
        </button>
      </form>
    </>
  );
}
