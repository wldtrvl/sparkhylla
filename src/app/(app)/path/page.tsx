import Link from "next/link";
import { LEVELS } from "@/lib/learning/path";
import { coverColor } from "@/lib/library";
import { loadPath } from "@/lib/path-data";
import { requireSession } from "@/lib/session";
import { LevelUpButton } from "@/components/LevelUpButton";

const LANG_RU = { no: "норвежский", en: "английский" } as const;

export default async function PathPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const { path, library } = await loadPath(s, lang);
  const at = LEVELS.indexOf(path.level);
  // the reading path: books she is reading, then the best-fitting ones she has not started, then finished ones
  const books = [
    ...library.filter((b) => b.progress && !b.progress.finished),
    ...library.filter((b) => b.availability === "in_app" && !b.progress),
    ...library.filter((b) => b.progress?.finished),
  ].slice(0, 9);

  return (
    <>
      <div className="stack gap-6">
        <span className="eyebrow">Мой путь · {LANG_RU[lang]}</span>
        <h1 className="display">
          Уровень {path.level}
          {path.next ? ` → ${path.next}` : ""}
        </h1>
        <ol className="ladder" aria-label="Уровни">
          {LEVELS.map((l, i) => (
            <li key={l} className={i < at ? "passed" : i === at ? "current" : undefined}>
              <span>{l}</span>
              {i === at && (
                <i className="ladder-fill" style={{ width: `${Math.round(path.progress * 100)}%` }} aria-label={`${Math.round(path.progress * 100)}% уровня`} />
              )}
            </li>
          ))}
        </ol>
      </div>

      {path.ready && path.next && (
        <div className="card ready-card">
          <b>Все цели уровня {path.level} выполнены.</b>
          <span className="small">Можно перейти на {path.next}: библиотека начнёт предлагать тексты сложнее, а новые цели станут больше.</span>
          <LevelUpButton lang={lang} to={path.next} />
        </div>
      )}

      <div className="card next-step">
        <span className="eyebrow">Следующий шаг</span>
        <b className="title-read">{path.step.title}</b>
        <span className="small muted">{path.step.why}</span>
        <Link className="btn self-start" href={path.step.href}>
          Начать
        </Link>
      </div>

      <section className="card">
        <div className="row">
          <h2 className="h2">Цели уровня {path.level}</h2>
          <span className="small muted num ml-auto">выполнено на {Math.round(path.progress * 100)}%</span>
        </div>
        <div className="tracks">
          {path.tracks.map((t) => {
            const pct = Math.min(100, Math.round((t.done / t.target) * 100));
            return (
              <Link key={t.key} href={t.href} className={`track${pct >= 100 ? " complete" : ""}`}>
                <span className="track-title">
                  {pct >= 100 ? "✓ " : ""}
                  {t.title}
                </span>
                <span className="progress">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="small num track-count">
                  {Math.min(t.done, t.target)} / {t.target}
                </span>
                <span className="small muted track-hint">{t.hint}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="stack gap-14">
        <h2 className="h2">Книги на пути</h2>
        <div className="path-books">
          {books.map((b, i) => (
            <Link key={b.id} href={`/read/${b.id}`} className={`path-book${b.progress?.finished ? " done" : ""}`}>
              <span className="path-step num">{b.progress?.finished ? "✓" : i + 1}</span>
              <span className="path-cover" style={{ background: coverColor(b.id) }} aria-hidden="true" />
              <span className="stack gap-4" style={{ minWidth: 0 }}>
                <b className="read">{b.title}</b>
                <span className="small muted">
                  {b.author}
                  {b.coverage != null ? ` · знаете ${Math.round(b.coverage * 100)}% слов` : ""}
                </span>
                <span className="small">{b.progress?.finished ? "прочитано" : b.progress ? `читаю, стр. ${b.progress.page + 1}` : "ещё не начато"}</span>
              </span>
            </Link>
          ))}
          {!books.length && <p className="muted">В библиотеке пока нет текстов на этом языке.</p>}
        </div>
      </section>
    </>
  );
}
