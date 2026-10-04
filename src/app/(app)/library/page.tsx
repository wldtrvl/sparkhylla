import Link from "next/link";
import { coverColor, libraryFor, type LibraryItem } from "@/lib/library";
import { logEvent, requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";

const KINDS: Record<string, string> = { novel: "Романы", story: "Рассказы", tale: "Сказки", fable: "Басни", article: "Статьи", other: "Другое" };
const GROUPS = [
  { key: "fits", title: "Подходит сейчас" },
  { key: "stretch", title: "Чуть сложнее — на следующий месяц" },
  { key: "later", title: "На потом" },
] as const;

function Book({ b }: { b: LibraryItem }) {
  return (
    <Link href={`/read/${b.id}`} className="book">
      <div className="cover" style={{ background: coverColor(b.id) }}>
        <b lang={htmlLang(b.lang)}>{b.title}</b>
        <span>{b.author}</span>
      </div>
      <span className="muted small">
        {KINDS[b.kind] ?? b.kind}
        {b.year ? ` · ${b.year}` : ""}
      </span>
      {b.coverage != null ? (
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <div className="progress" style={{ flex: 1 }}>
            <i style={{ width: `${Math.round(b.coverage * 100)}%`, background: b.group === "fits" ? "var(--ok)" : "var(--brass)" }} />
          </div>
          <span className="small num strong">
            {Math.round(b.coverage * 100)}%
          </span>
        </div>
      ) : (
        <span className="small muted">уровень {b.est_level ?? "?"}</span>
      )}
      <div className="row gap-6">
        <span className="chip">{b.availability === "in_app" ? "Читать здесь" : "Библиотека / Bokhylla"}</span>
        {b.orthography === "old" && (
          <span className="chip" title="Написание до реформы 1938 года: sig, kunde, efter. Такие слова засчитываются по современному написанию.">
            старая орфография
          </span>
        )}
        {b.progress?.finished && <span className="chip ok">прочитано</span>}
        {b.progress && !b.progress.finished && <span className="chip brass">читаю</span>}
      </div>
    </Link>
  );
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const all = await libraryFor(s, lang);
  const needle = q.toLocaleLowerCase("nb");
  const matches = (b: LibraryItem) => !needle || `${b.title} ${b.author}`.toLocaleLowerCase("nb").includes(needle);
  // books she has started come first, on their own shelf (not repeated below)
  const reading = q ? [] : all.filter((b) => b.progress && !b.progress.finished);
  const items = all.filter((b) => (!kind || b.kind === kind) && matches(b) && !reading.includes(b));
  if (q) logEvent(s, "library.search", { q, results: items.length, kind: kind ?? null });
  const kinds = Array.from(new Set(all.map((b) => b.kind)));
  const featured = all.find((b) => b.group === "fits" && b.author_note) ?? all.find((b) => b.author_note);

  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Библиотека</h1>
        <p className="lead">
          Только настоящие тексты, без упрощений. Сначала — книги, в которых вы уже знаете 95–98% слов: так читать интересно, а не тяжело. Процент растёт вместе
          с вашим словарём.
        </p>
      </div>
      <form className="row gap-8" role="search" action="/library">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label htmlFor="lib-q" className="sr-only">
          Поиск по названию или автору
        </label>
        <input id="lib-q" name="q" className="input" type="search" placeholder="Название или автор" defaultValue={q} style={{ flex: 1, minWidth: 200, maxWidth: 420 }} />
        <button className="btn soft" type="submit">
          Найти
        </button>
        {q && (
          <Link href={kind ? `/library?kind=${kind}` : "/library"} className="small">
            Сбросить
          </Link>
        )}
      </form>
      <div className="chips">
        <Link href="/library" className="btn soft small" aria-current={!kind ? "page" : undefined} style={!kind ? { borderColor: "var(--cloth)", background: "var(--cloth-soft)" } : undefined}>
          Все
        </Link>
        {kinds.map((k) => (
          <Link key={k} href={`/library?kind=${k}`} className="btn soft small" aria-current={kind === k ? "page" : undefined} style={kind === k ? { borderColor: "var(--cloth)", background: "var(--cloth-soft)" } : undefined}>
            {KINDS[k] ?? k}
          </Link>
        ))}
      </div>

      <div className="split">
        <div className="wide stack" style={{ gap: 28 }}>
          {!!reading.length && (
            <section className="stack gap-14">
              <h2 className="h2">Сейчас читаю</h2>
              <div className="grid-books">
                {reading.map((b) => (
                  <Book key={b.id} b={b} />
                ))}
              </div>
            </section>
          )}
          {GROUPS.map((g) => {
            const list = items.filter((b) => b.group === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key} className="stack gap-14">
                <h2 className="h2">{g.title}</h2>
                <div className="grid-books">
                  {list.map((b) => (
                    <Book key={b.id} b={b} />
                  ))}
                </div>
              </section>
            );
          })}
          {!items.length && !reading.length && (
            <p className="muted">{q ? `По запросу «${q}» ничего не нашлось.` : "Здесь пока нет книг. Помощник может добавить их в кабинете."}</p>
          )}
        </div>
        <aside className="side">
          {featured && (
            <div className="card">
              <span className="eyebrow">Автор</span>
              <b style={{ fontFamily: "var(--f-display)", fontSize: 30, lineHeight: 1.05 }}>{featured.author}</b>
              <p className="relaxed">{featured.author_note}</p>
              <Link className="btn ghost" href={`/read/${featured.id}`}>
                {featured.title}
              </Link>
            </div>
          )}
          <div className="card" style={{ background: "var(--cloth-soft)", border: 0 }}>
            <b>Откуда книги</b>
            <p className="small relaxed">
              Старые тексты, свободные от авторских прав, читаются прямо здесь. Современные книги — через библиотеку или Bokhylla Национальной библиотеки (бесплатно из
              Норвегии). Вставьте страницу, которую читаете, — и мы подсветим новые слова.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
