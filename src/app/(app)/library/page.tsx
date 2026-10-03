import Link from "next/link";
import { coverColor, libraryFor, type LibraryItem } from "@/lib/library";
import { requireSession } from "@/lib/session";

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
        <b lang={b.lang === "no" ? "nb" : "en"}>{b.title}</b>
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
          <span className="small num" style={{ fontWeight: 600 }}>
            {Math.round(b.coverage * 100)}%
          </span>
        </div>
      ) : (
        <span className="small muted">уровень {b.est_level ?? "?"}</span>
      )}
      <div className="row" style={{ gap: 6 }}>
        <span className="chip">{b.availability === "in_app" ? "Читать здесь" : "Библиотека / Bokhylla"}</span>
        {b.progress?.finished && <span className="chip ok">прочитано</span>}
        {b.progress && !b.progress.finished && <span className="chip brass">читаю</span>}
      </div>
    </Link>
  );
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const kind = (await searchParams).kind as string | undefined;
  const all = await libraryFor(s, lang);
  const items = kind ? all.filter((b) => b.kind === kind) : all;
  const kinds = Array.from(new Set(all.map((b) => b.kind)));
  const featured = all.find((b) => b.group === "fits" && b.author_note) ?? all.find((b) => b.author_note);

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="display">Библиотека</h1>
        <p className="lead">
          Только настоящие тексты, без упрощений. Сначала — книги, в которых вы уже знаете 95–98% слов: так читать интересно, а не тяжело. Процент растёт вместе
          с вашим словарём.
        </p>
      </div>
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
          {GROUPS.map((g) => {
            const list = items.filter((b) => b.group === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key} className="stack" style={{ gap: 14 }}>
                <h2 className="h2">{g.title}</h2>
                <div className="grid-books">
                  {list.map((b) => (
                    <Book key={b.id} b={b} />
                  ))}
                </div>
              </section>
            );
          })}
          {!items.length && <p className="muted">Здесь пока нет книг. Помощник может добавить их в кабинете.</p>}
        </div>
        <aside className="side">
          {featured && (
            <div className="card">
              <span className="eyebrow">Автор</span>
              <b style={{ fontFamily: "var(--f-display)", fontSize: 30, lineHeight: 1.05 }}>{featured.author}</b>
              <p style={{ lineHeight: 1.55 }}>{featured.author_note}</p>
              <Link className="btn ghost" href={`/read/${featured.id}`}>
                {featured.title}
              </Link>
            </div>
          )}
          <div className="card" style={{ background: "var(--cloth-soft)", border: 0 }}>
            <b>Откуда книги</b>
            <p className="small" style={{ lineHeight: 1.55 }}>
              Старые тексты, свободные от авторских прав, читаются прямо здесь. Современные книги — через библиотеку или Bokhylla Национальной библиотеки (бесплатно из
              Норвегии). Вставьте страницу, которую читаете, — и мы подсветим новые слова.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
