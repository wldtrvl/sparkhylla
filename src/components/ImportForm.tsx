"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DraftStats } from "@/lib/import/analyze";
import { TEXT_KINDS, type ImportDraft, type TextKind } from "@/lib/import/types";
import { isHeading, paginate, paragraphText, WORD_PATTERN } from "@/lib/text-format";
import { track } from "./tracker";

const KIND_RU: Record<TextKind, string> = { novel: "Роман", story: "Рассказ", tale: "Сказки", fable: "Басни", article: "Статья", other: "Другое" };
const GROUP_RU = { fits: "подходит сейчас", stretch: "чуть сложнее", later: "на потом" } as const;
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

interface Fit {
  name: string;
  level: string;
  coverage: number;
  group: keyof typeof GROUP_RU;
}
interface Preview {
  draft: ImportDraft;
  stats: DraftStats;
  fits: Fit[];
}

const words = (s: string) => (s.match(new RegExp(WORD_PATTERN.source, "gu")) ?? []).length;

/** Russian plural: plural(3, ["глава", "главы", "глав"]) → "главы" */
function plural(n: number, [one, few, many]: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "save">("");
  const [err, setErr] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [meta, setMeta] = useState({ title: "", author: "", year: "", lang: "no" as "no" | "en", kind: "story" as TextKind, estLevel: "" as string, authorNote: "", license: "", sourceUrl: "" });
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [confirmed, setConfirmed] = useState(false);

  const paras = useMemo(() => (p ? p.draft.body.split(/\n\s*\n/).filter((x) => x.trim()) : []), [p]);
  const body = useMemo(() => paras.slice(range[0], range[1] + 1).join("\n\n"), [paras, range]);
  const trimmed = useMemo(() => ({ words: words(body), pages: body ? paginate(body).length : 0 }), [body]);

  async function preview(input: { url: string } | { file: File }) {
    setBusy("preview");
    setErr("");
    track("import.preview_request", { kind: "url" in input ? "url" : "file", host: "url" in input ? safeHost(input.url) : null, file: "file" in input ? input.file.name : null });
    try {
      const r =
        "url" in input
          ? await fetch("/api/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: input.url }) })
          : await fetch("/api/import/preview", { method: "POST", body: form(input.file) });
      const d = await r.json().catch(() => ({ error: "Сервер не ответил." }));
      if (!r.ok) throw new Error(d.error);
      const pv = d as Preview;
      setP(pv);
      const n = pv.draft.body.split(/\n\s*\n/).filter((x) => x.trim()).length;
      setRange([0, Math.max(0, n - 1)]);
      setConfirmed(false);
      setMeta({ title: pv.draft.title, author: pv.draft.author, year: pv.draft.year, lang: pv.draft.lang, kind: pv.draft.kind, estLevel: "", authorNote: "", license: pv.draft.license, sourceUrl: pv.draft.sourceUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      track("import.preview_failed", { message: msg.slice(0, 160) });
      setErr(msg);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!p) return;
    setBusy("save");
    setErr("");
    track("import.save_click", { source: p.draft.source, words: trimmed.words, trimmed: range[0] > 0 || range[1] < paras.length - 1 });
    try {
      const r = await fetch("/api/import/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...meta, estLevel: meta.estLevel || null, source: p.draft.source, body, rights: p.draft.rights, confirmed }),
      });
      const d = await r.json().catch(() => ({ error: "Сервер не ответил." }));
      if (!r.ok) throw new Error(d.error);
      track("import.saved", { textId: d.id, replaced: d.replaced });
      router.push(`/read/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setBusy("");
    }
  }

  const rights = p?.draft.rights;
  const canSave = !!p && rights !== "blocked" && (rights === "ok" || confirmed) && meta.title.trim() && meta.author.trim() && meta.license.trim().length >= 3 && trimmed.words >= 20;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) preview({ url: url.trim() });
          }}
        >
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="src-url">Ссылка на текст</label>
            <input id="src-url" className="input" inputMode="url" placeholder="https://no.wikisource.org/wiki/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={!!busy || !url.trim()} style={{ alignSelf: "flex-end" }}>
            {busy === "preview" ? "Загружаю…" : "Загрузить"}
          </button>
        </form>
        <div className="row small muted gap-8">
          <label htmlFor="src-file" className="btn soft small" style={{ cursor: "pointer" }}>
            Или выбрать файл .txt / .epub
          </label>
          <input
            id="src-file"
            type="file"
            accept=".txt,.epub,text/plain,application/epub+zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) preview({ file: f });
              e.target.value = "";
            }}
          />
        </div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <b>Wikisource</b> (no.wikisource.org): норвежская классика; ссылка на оглавление загрузит весь сборник.
          </li>
          <li>
            <b>Project Gutenberg</b>: книги, чьи авторы умерли больше 70 лет назад.
          </li>
          <li>
            <b>Store norske leksikon</b> и <b>Википедия</b>: статьи на современном языке, удобно для B1–B2.
          </li>
          <li>
            <b>bokselskap.no</b>: скачайте книгу в EPUB и выберите файл.
          </li>
        </ul>
        {busy === "preview" && <p className="muted small">Сборник с Wikisource загружается до минуты — по странице на каждый текст.</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {p && (
        <div className="split">
          <div className="wide stack gap-16">
            <div className="card gap-14">
              <span className="eyebrow">Описание</span>
              <div className="field">
                <label htmlFor="m-title">Название</label>
                <input id="m-title" className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="m-author">Автор</label>
                <input id="m-author" className="input" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                <div className="field">
                  <label htmlFor="m-year">Год</label>
                  <input id="m-year" className="input" value={meta.year} onChange={(e) => setMeta({ ...meta, year: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="m-lang">Язык</label>
                  <select id="m-lang" className="input" value={meta.lang} onChange={(e) => setMeta({ ...meta, lang: e.target.value as "no" | "en" })}>
                    <option value="no">Norsk</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="m-kind">Вид</label>
                  <select id="m-kind" className="input" value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value as TextKind })}>
                    {TEXT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_RU[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="m-level">Уровень (оценка)</label>
                  <select id="m-level" className="input" value={meta.estLevel} onChange={(e) => setMeta({ ...meta, estLevel: e.target.value })}>
                    <option value="">—</option>
                    {LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="m-note">Об авторе (по-русски, 1–2 предложения)</label>
                <textarea id="m-note" className="input" style={{ minHeight: 70 }} value={meta.authorNote} onChange={(e) => setMeta({ ...meta, authorNote: e.target.value })} />
              </div>
            </div>

            <div className="card gap-10">
              <div className="row">
                <span className="eyebrow">Текст</span>
                <span className="small muted num ml-auto">
                  абзацы {range[0] + 1}–{range[1] + 1} из {paras.length} · {trimmed.words.toLocaleString("ru-RU")} {plural(trimmed.words, ["слово", "слова", "слов"])} · {trimmed.pages} стр.
                </span>
              </div>
              <p className="small muted">Уберите титульный лист, оглавление и примечания: нажмите «Начало» у первого абзаца книги и «Конец» у последнего.</p>
              <ol className="trim-list" aria-label="Абзацы текста">
                {paras.map((x, i) => {
                  const out = i < range[0] || i > range[1];
                  return (
                    <li key={i} className={out ? "out" : undefined}>
                      <span className="num muted">{i + 1}</span>
                      <span className={isHeading(x) ? "h" : undefined}>{paragraphText(x).slice(0, 160)}</span>
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button type="button" className="chip" aria-pressed={range[0] === i} onClick={() => (setRange([i, Math.max(i, range[1])]), track("import.trim", { start: i }))}>
                          Начало
                        </button>
                        <button type="button" className="chip" aria-pressed={range[1] === i} onClick={() => (setRange([Math.min(range[0], i), i]), track("import.trim", { end: i }))}>
                          Конец
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <aside className="side">
            <div className={`card rights-${rights}`}>
              <span className="eyebrow">{rights === "ok" ? "Можно хранить целиком" : rights === "check" ? "Нужна ваша проверка" : "Нельзя сохранить"}</span>
              {p.draft.notes.map((n) => (
                <p key={n} className="small" style={{ lineHeight: 1.5 }}>
                  {n}
                </p>
              ))}
              <div className="field">
                <label htmlFor="m-license">Лицензия</label>
                <input id="m-license" className="input" placeholder="public domain / CC BY-SA 4.0 / NLOD" value={meta.license} onChange={(e) => setMeta({ ...meta, license: e.target.value })} disabled={rights === "blocked"} />
              </div>
              <div className="field">
                <label htmlFor="m-source">Источник</label>
                <input id="m-source" className="input" value={meta.sourceUrl} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} disabled={rights === "blocked"} />
              </div>
              {rights === "check" && (
                <label className="row small" style={{ gap: 10, flexWrap: "nowrap", alignItems: "flex-start", fontWeight: 400 }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 20, height: 20, flex: "none", accentColor: "var(--cloth)" }} />
                  Я проверил(а): автор умер больше 70 лет назад, или у текста свободная лицензия, и это оригинал, а не адаптация.
                </label>
              )}
            </div>

            <div className="card">
              <span className="eyebrow">Насколько подходит</span>
              {p.fits.map((f) => (
                <div key={f.name} className="row gap-8">
                  <b>{f.name}</b>
                  <span className="small muted">чтение {f.level}</span>
                  <span className={`chip ${f.group === "fits" ? "ok" : "brass"} ml-auto`}>
                    {Math.round(f.coverage * 100)}% · {GROUP_RU[f.group]}
                  </span>
                </div>
              ))}
              <span className="small muted">
                {p.stats.words.toLocaleString("ru-RU")} {plural(p.stats.words, ["слово", "слова", "слов"])} до обрезки
                {p.stats.headings ? ` · ${p.stats.headings} ${plural(p.stats.headings, p.draft.kind === "article" ? ["раздел", "раздела", "разделов"] : ["глава", "главы", "глав"])}` : ""} ·{" "}
                {p.stats.orthography === "old" ? "старая орфография" : "современная орфография"}
              </span>
              {p.stats.warnings.map((w) => (
                <p key={w} className="notice small">
                  {w}
                </p>
              ))}
            </div>

            <button type="button" className="btn" disabled={!canSave || !!busy} onClick={save}>
              {busy === "save" ? "Сохраняю и строю словарь…" : "Добавить в библиотеку"}
            </button>
            {rights === "blocked" && (
              <p className="small muted">
                {p.draft.source === "snl"
                  ? "Попробуйте другую статью: у многих статей SNL лицензия «fri», их можно сохранить."
                  : "Книги под авторским правом остаются ссылкой на библиотеку или Bokhylla; читать их можно в режиме компаньона."}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function form(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}
