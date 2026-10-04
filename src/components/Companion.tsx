"use client";
import { useState } from "react";
import { Reader } from "./Reader";

/** Reading companion for books read elsewhere: paste a page, get the same word help. Nothing pasted is stored. */
export function Companion({ lang, textId }: { lang: "no" | "en"; textId: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ paragraphs: string[]; unknown: string[]; coverage: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function analyze() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, text, textId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult({ paragraphs: text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean), unknown: d.unknown, coverage: d.coverage });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <div className="page">
        <div className="row">
          <span className="chip ok">вы знаете {Math.round(result.coverage * 100)}% слов на этой странице</span>
          <button type="button" className="btn soft small ml-auto" onClick={() => setResult(null)}>
            Вставить другую страницу
          </button>
        </div>
        <Reader lang={lang} textId={textId} source={`text:${textId}`} paragraphs={result.paragraphs} unknown={result.unknown} learning={[]} />
      </div>
    );

  return (
    <div className="card">
      <label htmlFor="paste" className="h2">
        Страница, которую вы читаете
      </label>
      <textarea id="paste" className="input" placeholder="Скопируйте текст страницы и вставьте сюда" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button type="button" className="btn" disabled={busy || text.trim().length < 20} onClick={analyze}>
          {busy ? "Смотрю…" : "Подсветить новые слова"}
        </button>
        {err && <span className="error">{err}</span>}
      </div>
    </div>
  );
}
