import Link from "next/link";
import { notFound } from "next/navigation";
import { Companion } from "@/components/Companion";
import { PageNav } from "@/components/PageNav";
import { Reader } from "@/components/Reader";
import { VideoReader } from "@/components/VideoReader";
import { coverage, nameForms, tokenize } from "@/lib/learning/coverage";
import { TEXT_COLUMNS, type TextRow } from "@/lib/library";
import { paginate, htmlLang } from "@/lib/text-format";
import { requireSession, wordState } from "@/lib/session";
import { asVideo } from "@/lib/video";

export default async function ReadPage({ params, searchParams }: PageProps<"/read/[id]">) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await s.supabase.from("texts").select(TEXT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as unknown as TextRow;
  const langAttr = htmlLang(t.lang);

  const header = (
    <div className="stack" style={{ gap: 6, textAlign: "center", alignItems: "center" }}>
      <span className="eyebrow">
        {t.author}
        {t.year ? ` · ${t.year}` : ""} · {t.kind === "video" ? "видео" : "оригинал"}
      </span>
      <h1 className="display" lang={langAttr}>
        {t.title}
      </h1>
    </div>
  );

  if (t.availability === "external" || !t.body) {
    return (
      <>
        <Link href="/library" className="strong">
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
          <p className="small muted text-center">
            Эта книга защищена авторским правом, поэтому её текст не хранится здесь. Читайте её в библиотеке или в Bokhylla, а сюда вставляйте страницу, которую читаете сейчас.
          </p>
        </div>
        <Companion lang={t.lang} textId={t.id} />
      </>
    );
  }

  const video = asVideo((data as { video?: unknown }).video);
  // a video transcript stays on one page, so the player keeps playing while she reads
  const pages = video ? [t.body.split("\n\n")] : paginate(t.body);
  const [{ data: prog }, { known, learning }] = await Promise.all([
    sp.page != null ? Promise.resolve({ data: null }) : s.supabase.from("reading_progress").select("page").eq("user_id", s.user.id).eq("text_id", t.id).maybeSingle(),
    wordState(s, t.lang),
  ]);
  const pageIdx = Math.min(Math.max(0, sp.page != null ? Number(sp.page) || 0 : (prog?.page ?? 0)), pages.length - 1);
  const pageText = pages[pageIdx].join("\n\n");
  const names = nameForms(tokenize(t.body));
  const cov = coverage(pageText, known, t.lang, names);
  const whole = coverage(t.body, known, t.lang, names);

  return (
    <>
      <div className="row">
        <Link href="/library" className="strong">
          ← Библиотека
        </Link>
        <span className="chip ok ml-auto">
          вы знаете {Math.round(whole.coverage * 100)}% слов {video ? "этого видео" : "этой книги"}
        </span>
      </div>
      <div className="page">
        {header}
        {video ? (
          <VideoReader video={video} lang={t.lang} textId={t.id} source={`text:${t.id}`} paragraphs={pages[0]} unknown={cov.unknown} learning={learning} />
        ) : (
          <Reader
            key={pageIdx}
            lang={t.lang}
            textId={t.id}
            source={`text:${t.id}`}
            paragraphs={pages[pageIdx]}
            unknown={cov.unknown}
            learning={learning}
            audioUrl={t.audio_url}
          />
        )}
        <PageNav textId={t.id} page={pageIdx} total={pages.length} coverage={whole.coverage} />
      </div>
      <p className="small muted text-center">
        {t.license ? `${video ? "Видео и субтитры" : "Текст"}: ${t.license}.` : ""} {t.source_url ? <a href={t.source_url} target="_blank" rel="noopener noreferrer">Источник</a> : null}
      </p>
    </>
  );
}
