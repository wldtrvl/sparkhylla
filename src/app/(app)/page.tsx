import Link from "next/link";
import { GRAMMAR } from "@/lib/learning/grammar";
import { quoteOfDay, type Quote } from "@/lib/learning/quotes";
import { libraryFor } from "@/lib/library";
import { logEvent, requireSession, type DailyActivity } from "@/lib/session";
import { requestClock } from "@/lib/time";
import { htmlLang } from "@/lib/text-format";

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function greeting(lang: "no" | "en") {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Oslo" }).format(new Date()));
  if (lang === "en") return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return h < 10 ? "God morgen" : h < 18 ? "God ettermiddag" : "God kveld";
}

export default async function DeskPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const clock = requestClock();
  const nowIso = clock.iso;
  const since = clock.daysAgo(6).slice(0, 10);

  const [quotes, due, library, scenarios, convs, fb, activity] = await Promise.all([
    s.supabase.from("quotes").select("id,text,text_lang,translation_ru,translation_uk,author,author_note,origin,status,source").eq("active", true),
    s.supabase.from("words").select("term", { count: "exact" }).eq("user_id", s.user.id).eq("lang", lang).eq("status", "learning").lte("due", nowIso).limit(6),
    libraryFor(s, lang),
    s.supabase.from("scenarios").select("id,title_ru,level").eq("lang", lang).eq("active", true).order("sort"),
    s.supabase.from("conversations").select("scenario_id,started_at").eq("user_id", s.user.id).eq("lang", lang).order("started_at", { ascending: false }).limit(50),
    s.supabase.from("feedback_items").select("rule_key").eq("user_id", s.user.id).eq("lang", lang).gte("created_at", clock.daysAgo(14)),
    s.supabase.rpc("daily_activity", { p_user: s.user.id, p_since: since }),
  ]);

  const quote = quoteOfDay((quotes.data ?? []) as Quote[]);
  const dueCount = due.count ?? 0;
  const reading = library.find((b) => b.progress && !b.progress.finished) ?? library.find((b) => b.group === "fits" && !b.progress?.finished) ?? library[0];
  // conversation of the day: the scenario practised least recently (never first)
  const lastDone = new Map<string, string>();
  for (const c of convs.data ?? []) if (c.scenario_id && !lastDone.has(c.scenario_id)) lastDone.set(c.scenario_id, c.started_at);
  const scenario = [...(scenarios.data ?? [])].sort((a, b) => (lastDone.get(a.id) ?? "").localeCompare(lastDone.get(b.id) ?? ""))[0];
  // grammar of the week: her most frequent recent mistake, else the first topic for her level
  const counts: Record<string, number> = {};
  for (const r of fb.data ?? []) if (r.rule_key) counts[r.rule_key] = (counts[r.rule_key] ?? 0) + 1;
  const topKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topic = GRAMMAR.find((g) => g.key === topKey) ?? GRAMMAR.find((g) => g.lang === lang)!;
  const days = new Set(((activity.data ?? []) as DailyActivity[]).filter((d) => Number(d.minutes) >= 1).map((d) => String(d.day)));
  const week = clock.dayKeys(7);

  logEvent(s, "decision.daily_plan", { lang, dueCount, textId: reading?.id, scenario: scenario?.id, grammar: topic.key, grammarFromMistakes: !!topKey, quoteId: quote?.id });

  const date = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Oslo" }).format(new Date());
  const name = s.profile.display_name;

  return (
    <>
      <div className="row items-end">
        <div className="stack gap-4">
          <span className="eyebrow">{date}</span>
          <h1 className="display" lang={htmlLang(lang)}>
            {greeting(lang)}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <div className="row small muted" style={{ marginLeft: "auto", gap: 6 }} aria-label={`Занятия на этой неделе: ${days.size} из 7 дней`}>
          Неделя:
          {week.map((d, i) => (
            <span key={d} className={`week-day${i === week.length - 1 ? " today" : ""}`} aria-hidden="true">
              <span className={days.has(d) ? "dot on" : "dot"} />
              {WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]}
            </span>
          ))}
        </div>
      </div>

      {quote && (
        <figure className="quote">
          <span className="eyebrow" style={{ color: "var(--warn)" }}>
            Цитата дня · завтра будет новая
          </span>
          <blockquote lang={quote.text_lang === "no" ? "nb" : quote.text_lang}>«{quote.text}»</blockquote>
          <span className="muted">{s.profile.ui_lang === "uk" && quote.translation_uk ? quote.translation_uk : quote.translation_ru}</span>
          <figcaption className="row gap-10">
            <b>{quote.author}</b>
            {quote.author_note && <span className="muted small">{quote.author_note}</span>}
            {quote.status === "attributed" && <span className="chip">приписывается</span>}
          </figcaption>
        </figure>
      )}

      <div className="grid">
        <div className="card">
          <span className="eyebrow">Повторить слова</span>
          <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
            <span className="num" style={{ fontFamily: "var(--f-display)", fontWeight: 600, fontSize: 56, lineHeight: 1 }}>
              {dueCount}
            </span>
            <span className="muted">{dueCount ? "ждут сегодня" : "на сегодня всё"}</span>
          </div>
          {!!due.data?.length && (
            <span className="muted small read-italic" lang={htmlLang(lang)}>
              {due.data.map((w) => w.term).join(" · ")}
            </span>
          )}
          <Link className="btn mt-auto" href="/words">
            {dueCount ? "Начать повторение" : "Мои слова"}
          </Link>
        </div>

        {reading && (
          <div className="card">
            <span className="eyebrow">{reading.progress && !reading.progress.finished ? "Сейчас читаю" : "Предлагаю почитать"}</span>
            <b className="title-read">{reading.title}</b>
            <span className="muted small">
              {reading.author}
              {reading.year ? ` · ${reading.year}` : ""} · оригинал
            </span>
            {reading.coverage != null && <span className="chip ok">вы знаете {Math.round(reading.coverage * 100)}% слов</span>}
            <Link className="btn mt-auto" href={`/read/${reading.id}`}>
              {reading.progress ? "Продолжить чтение" : "Открыть"}
            </Link>
          </div>
        )}

        {scenario && (
          <div className="card">
            <span className="eyebrow">Разговор дня</span>
            <b className="title-read">{scenario.title_ru}</b>
            <span className="muted small">Голосом, около 5 минут. Ошибки разберём в конце, спокойно.</span>
            <Link className="btn ghost mt-auto" href={`/talk/${scenario.id}`}>
              Начать разговор
            </Link>
          </div>
        )}
      </div>

      <div className="notice row">
        <b>Грамматика:</b>
        <span>
          {topic.title}
          {topKey ? ` — встретилось в ваших разговорах ${counts[topKey]} раз(а) за 2 недели.` : "."}
        </span>
        <Link href={`/grammar#${topic.key}`} style={{ marginLeft: "auto", fontWeight: 600, color: "var(--brass-ink)" }}>
          Открыть тему →
        </Link>
      </div>
    </>
  );
}
