"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { speak } from "./audio";
import { track } from "./tracker";
import { htmlLang } from "@/lib/text-format";

export interface WordRow {
  id: string;
  term: string;
  translation: string | null;
  note: string | null;
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
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();
  const shown = useMemo(() => {
    const x = q.trim().toLowerCase();
    return words.filter((w) => w.status !== "ignored" && (!x || w.term.toLowerCase().includes(x) || (w.translation ?? "").toLowerCase().includes(x))).slice(0, 200);
  }, [q, words]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim() || !tr.trim()) return;
    setBusy(true);
    setAddError("");
    const r = await fetch("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang, term: term.trim(), translation: tr.trim(), context: ctx.trim() || undefined, kind: term.trim().includes(" ") ? "phrase" : "word", source: "manual" }),
    }).catch(() => null);
    if (!r?.ok) {
      track("word.add_failed", { status: r?.status ?? null });
      setAddError("Слово не сохранилось — проверьте интернет и нажмите «Добавить» ещё раз.");
      setBusy(false);
      return;
    }
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
                <th aria-label="Изменить" />
              </tr>
            </thead>
            <tbody>
              {shown.map((w) =>
                editing === w.id ? (
                  <tr key={w.id}>
                    <td colSpan={3}>
                      <WordEditor lang={lang} word={w} onDone={(changed) => (setEditing(null), changed && router.refresh())} />
                    </td>
                  </tr>
                ) : (
                  <tr key={w.id}>
                    <td>
                      <button type="button" onClick={() => speak(w.term, lang)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                        <b lang={htmlLang(lang)} className="read">
                          {w.term}
                        </b>
                      </button>
                      <br />
                      <span className="small muted">{w.translation}</span>
                    </td>
                    <td className="small">{w.status === "known" ? "знаю" : dueLabel(w.due)}</td>
                    <td style={{ width: 44 }}>
                      <button
                        type="button"
                        className="gloss-close"
                        aria-label={`Изменить «${w.term}»`}
                        title="Изменить"
                        onClick={() => {
                          track("word.edit_open", { id: w.id });
                          setEditing(w.id);
                        }}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ),
              )}
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
          <input id="t" className="input" lang={htmlLang(lang)} value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tr">Перевод</label>
          <input id="tr" className="input" value={tr} onChange={(e) => setTr(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c">Пример (необязательно)</label>
          <input id="c" className="input" lang={htmlLang(lang)} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        </div>
        <button className="btn soft" type="submit" disabled={busy}>
          {busy ? "Сохраняю…" : "Добавить"}
        </button>
        {addError && <p className="error">{addError}</p>}
      </form>
    </>
  );
}

/** Fix a translation or note, move a word between «учу» and «знаю», or delete it (with a second tap to confirm). */
function WordEditor({ lang, word, onDone }: { lang: "no" | "en"; word: WordRow; onDone: (changed: boolean) => void }) {
  const [tr, setTr] = useState(word.translation ?? "");
  const [note, setNote] = useState(word.note ?? "");
  const [status, setStatus] = useState<"learning" | "known">(word.status === "known" ? "known" : "learning");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(method: "PATCH" | "DELETE", body: object) {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/words", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr("Не сохранилось — проверьте интернет и попробуйте ещё раз.");
    onDone(true);
  }

  return (
    <div className="stack" style={{ gap: 10, padding: "4px 0" }}>
      <b lang={htmlLang(lang)} style={{ fontFamily: "var(--f-read)", fontSize: 18 }}>
        {word.term}
      </b>
      <div className="field">
        <label htmlFor={`tr-${word.id}`}>Перевод</label>
        <input id={`tr-${word.id}`} className="input" value={tr} onChange={(e) => setTr(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`note-${word.id}`}>Заметка</label>
        <input id={`note-${word.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="Статус">
        <button type="button" aria-pressed={status === "learning"} onClick={() => setStatus("learning")}>
          Учу — в повторении
        </button>
        <button type="button" aria-pressed={status === "known"} onClick={() => setStatus("known")}>
          Знаю
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row gap-8">
        <button type="button" className="btn small" disabled={busy} onClick={() => send("PATCH", { id: word.id, translation: tr, note: note || null, status })}>
          Сохранить
        </button>
        <button type="button" className="btn soft small" disabled={busy} onClick={() => onDone(false)}>
          Отмена
        </button>
        <button
          type="button"
          className="btn ghost small"
          style={{ marginLeft: "auto", color: confirmDelete ? "var(--danger)" : undefined, borderColor: confirmDelete ? "var(--danger)" : undefined }}
          disabled={busy}
          onClick={() => (confirmDelete ? send("DELETE", { id: word.id }) : setConfirmDelete(true))}
        >
          {confirmDelete ? "Точно удалить?" : "Удалить"}
        </button>
      </div>
    </div>
  );
}
