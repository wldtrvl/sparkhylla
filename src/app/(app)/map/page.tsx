import Link from "next/link";
import { WordMapBoard, type MapGroup } from "@/components/WordMapBoard";
import {
  focusLevel,
  MAP_LEVELS,
  normalizeTerm,
  POS,
  POS_LABEL,
  progress,
  statusIndex,
  statusOf,
  THEME_KEYS,
  THEMES,
  trees,
  type MapLevel,
  type MapWord,
  type Theme,
} from "@/lib/learning/wordmap";
import { logEvent, requireSession } from "@/lib/session";
import { loadMap, ownWords } from "@/lib/wordmap-data";

const LANG_NAME = { no: "норвежского", en: "английского" };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function WordMapPage({ searchParams }: PageProps<"/map">) {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const sp = await searchParams;
  const [map, mine] = await Promise.all([loadMap(s.supabase, lang), ownWords(s.supabase, s.user.id, lang)]);

  if (!map.words.length) {
    return (
      <div className="stack gap-4">
        <h1 className="display">Карта слов</h1>
        <p className="lead">Карта для этого языка ещё строится. Загляните чуть позже.</p>
      </div>
    );
  }

  const idx = statusIndex(mine);
  const st = (w: MapWord) => statusOf(w, idx);
  const prog = progress(map.words, st);
  const view = sp.view === "trees" ? "trees" : "levels";
  const q = typeof sp.q === "string" ? normalizeTerm(sp.q).slice(0, 40) : "";
  const theme = typeof sp.theme === "string" && (THEME_KEYS as string[]).includes(sp.theme) ? (sp.theme as Theme) : null;
  const chosen = typeof sp.level === "string" && (MAP_LEVELS as string[]).includes(sp.level) ? (sp.level as MapLevel) : null;
  const level = chosen ?? focusLevel(prog.byLevel);
  if (!chosen && view === "levels" && !q) {
    logEvent(s, "decision.map_focus", { reason: "first level with under 80% of words marked known", lang, level, known: prog.byLevel[level].known, total: prog.byLevel[level].total });
  }

  const chip = (w: MapWord) => ({ lemma: w.lemma, display: w.display, translation: w.translation, level: w.level, status: st(w) });
  let groups: MapGroup[] = [];
  if (q) {
    const hits = map.words.filter((w) => w.lemma.includes(q) || w.forms.includes(q) || w.translation.toLowerCase().includes(q)).slice(0, 120);
    groups = [{ key: "search", title: `Найдено: ${hits.length}`, subtitle: hits.length === 120 ? "показаны первые 120" : "", words: hits.map(chip) }];
  } else if (view === "levels") {
    const words = map.words.filter((w) => w.level === level && (!theme || w.theme === theme));
    groups = POS.map((p) => {
      const ws = words.filter((w) => w.pos === p);
      const known = ws.filter((w) => st(w) === "known").length;
      return { key: p, title: POS_LABEL[p], subtitle: `знаю ${known} из ${ws.length}`, words: ws.map(chip) };
    }).filter((g) => g.words.length);
  } else {
    const t = theme ?? "actions";
    const { trees: tr, loose } = trees(
      map.words.filter((w) => w.theme === t),
      map.roots,
    );
    groups = tr.map(({ root, branch }) => ({
      key: root.lemma,
      title: root.display,
      subtitle: root.translation,
      words: [root, ...branch].map(chip),
      root: root.lemma,
    }));
    if (loose.length) groups.push({ key: "loose", title: "Другие слова темы", subtitle: "без ветки", words: loose.map(chip) });
  }

  const href = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const all = { view: view === "trees" ? "trees" : null, level: chosen, theme, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `/map?${str}` : "/map";
  };
  const active = { borderColor: "var(--cloth)", background: "var(--cloth-soft)" };

  return (
    <>
      <div className="stack gap-4">
        <span className="eyebrow">{lang === "no" ? "Norsk" : "English"} · до B2</span>
        <h1 className="display">Карта слов</h1>
        <p className="lead">
          {map.words.length} самых употребительных слов {LANG_NAME[lang]} — от базовых к продвинутым, по частям речи и темам. Отмечайте, что уже знаете: это учитывается и в подборе книг.
        </p>
      </div>

      <section className="card stack" style={{ gap: 14 }}>
        <div className="row items-end">
          <div>
            <span className="num" style={{ fontFamily: "var(--f-display)", fontWeight: 600, fontSize: 40, lineHeight: 1 }}>
              {prog.all.known}
            </span>{" "}
            <span className="muted">из {prog.all.total} слов знаю</span>
          </div>
          {prog.all.learning > 0 && <span className="small muted ml-auto">учу сейчас: {prog.all.learning}</span>}
        </div>
        <div className="wm-levels">
          {MAP_LEVELS.map((l) => {
            const t = prog.byLevel[l];
            return (
              <Link key={l} href={href({ level: l, view: null, q: null })} className="wm-level" aria-current={view === "levels" && !q && l === level ? "page" : undefined}>
                <span className="row" style={{ gap: 6 }}>
                  <b>{l}</b>
                  <span className="small muted ml-auto num">{pct(t.known, t.total)}%</span>
                </span>
                <span className="wm-bar" aria-hidden="true">
                  <i className="k" style={{ width: `${pct(t.known, t.total)}%` }} />
                  <i className="l" style={{ width: `${pct(t.learning, t.total)}%` }} />
                </span>
                <span className="small muted num">
                  {t.known} из {t.total}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="row" style={{ gap: 10 }}>
        <div className="chips" role="tablist" aria-label="Вид карты">
          <Link href={href({ view: null })} className="btn soft small" role="tab" aria-selected={view === "levels"} style={view === "levels" ? active : undefined}>
            По уровням
          </Link>
          <Link href={href({ view: "trees", level: null })} className="btn soft small" role="tab" aria-selected={view === "trees"} style={view === "trees" ? active : undefined}>
            Деревья: от простых к сложным
          </Link>
        </div>
        <form className="row gap-8 ml-auto" role="search" action="/map">
          <label htmlFor="map-q" className="sr-only">
            Найти слово
          </label>
          <input id="map-q" name="q" className="input" type="search" placeholder="Слово или перевод" defaultValue={q} style={{ width: 220 }} />
          <button className="btn soft" type="submit">
            Найти
          </button>
          {q && (
            <Link href={href({ q: null })} className="small">
              Сбросить
            </Link>
          )}
        </form>
      </div>

      {!q && (
        <div className="chips wm-themes" aria-label="Темы">
          {view === "levels" && (
            <Link href={href({ theme: null })} className="btn soft small" style={!theme ? active : undefined}>
              Все темы
            </Link>
          )}
          {THEME_KEYS.filter((k) => prog.byTheme.get(k)?.total).map((k) => {
            const on = theme === k || (view === "trees" && !theme && k === "actions");
            const t = prog.byTheme.get(k)!;
            return (
              <Link key={k} href={href({ theme: k })} className="btn soft small" style={on ? active : undefined}>
                {THEMES[k]} <span className="muted num">{pct(t.known, t.total)}%</span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="small muted">
        {view === "trees" && !q
          ? "Сверху базовое слово, под ним — слова, которыми можно сказать то же точнее, сильнее или официальнее. Нажмите на слово: перевод, как ещё сказать, «Знаю» или «Учить»."
          : "Нажмите на слово: перевод, как ещё сказать, «Знаю» или «Учить». Знакомые слова можно отметить сразу всей группой и потом снять отметку с отдельных."}
      </p>

      <WordMapBoard lang={lang} groups={groups} context={q ? "search" : view === "trees" ? `trees:${theme ?? "actions"}` : `levels:${level}${theme ? `:${theme}` : ""}`} />
    </>
  );
}
