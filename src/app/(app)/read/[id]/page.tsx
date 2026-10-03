import Link from "next/link";
import { notFound } from "next/navigation";
import { Companion } from "@/components/Companion";
import { PageNav } from "@/components/PageNav";
import { Reader } from "@/components/Reader";
import { coverage } from "@/lib/learning/coverage";
import { paginate, type TextRow } from "@/lib/library";
import { knownSets, requireSession } from "@/lib/session";

export default async function ReadPage({ params, searchParams }: PageProps<"/read/[id]">) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await s.supabase.from("texts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as TextRow;
  const langAttr = t.lang === "no" ? "nb" : "en";

  const header = (
    <div className="stack" style={{ gap: 6, textAlign: "center", alignItems: "center" }}>
      <span className="eyebrow">
        {t.author}
        {t.year ? ` · ${t.year}` : ""} · оригинал
      </span>
      <h1 className="display" lang={langAttr}>
        {t.title}
      </h1>
    </div>
  );

  if (t.availability === "external" || !t.body) {
    return (
      <>
        <Link href="/library" style={{ fontWeight: 600 }}>
          ← Библиотека
        </Link>
        <div className="page">
          {header}
          {t.author_note && <p className="lead" style={{ margin: "0 auto", textAlign: "center" }}>{t.author_note}</p>}
          <div className="row" style={{ justifyContent: "center" }}>
            {t.source_url && (
              <a className="btn" href={t.source_url} target="_blank" rel="noopener noreferrer">
                Открыть книгу ↗
              </a>
            )}
          </div>
          <p className="small muted" style={{ textAlign: "center" }}>
            Эта книга защищена авторским правом, поэтому её текст не хранится здесь. Читайте её в библиотеке или в Bokhylla, а сюда вставляйте страницу, которую читаете сейчас.
          </p>
        </div>
        <Companion lang={t.lang} textId={t.id} />
      </>
    );
  }

  const pages = paginate(t.body);
  const { data: prog } = await s.supabase.from("reading_progress").select("page").eq("user_id", s.user.id).eq("text_id", t.id).maybeSingle();
  const pageIdx = Math.min(Math.max(0, sp.page != null ? Number(sp.page) || 0 : (prog?.page ?? 0)), pages.length - 1);
  const known = await knownSets(s, t.lang);
  const pageText = pages[pageIdx].join("\n\n");
  const cov = coverage(pageText, known);
  const whole = coverage(t.body, known);
  const { data: learningRows } = await s.supabase.from("words").select("term").eq("user_id", s.user.id).eq("lang", t.lang).eq("status", "learning");

  return (
    <>
      <div className="row">
        <Link href="/library" style={{ fontWeight: 600 }}>
          ← Библиотека
        </Link>
        <span className="chip ok" style={{ marginLeft: "auto" }}>
          вы знаете {Math.round(whole.coverage * 100)}% слов этой книги
        </span>
      </div>
      <div className="page">
        {header}
        <Reader
          key={pageIdx}
          lang={t.lang}
          textId={t.id}
          source={`text:${t.id}`}
          paragraphs={pages[pageIdx]}
          unknown={cov.unknown}
          learning={(learningRows ?? []).map((w) => String(w.term).toLowerCase())}
        />
        <PageNav textId={t.id} page={pageIdx} total={pages.length} coverage={whole.coverage} />
      </div>
      <p className="small muted" style={{ textAlign: "center" }}>
        {t.license ? `Текст: ${t.license}.` : ""} {t.source_url ? <a href={t.source_url} target="_blank" rel="noopener noreferrer">Источник</a> : null}
      </p>
    </>
  );
}
