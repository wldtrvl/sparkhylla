import "server-only";
import { GRAMMAR } from "@/lib/learning/grammar";
import { frequencyBand, isKnownForm, type Lang } from "@/lib/learning/coverage";
import { chooseKeyWords, chooseThemes, packGoal, PACK_THEMES, stepsFor, themeOf, wordsSaid, type PackMinutes, type StepKind, type ThemeSignals } from "@/lib/learning/packs";
import { statusIndex, statusOf } from "@/lib/learning/wordmap";
import { libraryFor, type LibraryItem } from "@/lib/library";
import { logEvent, ownWordsFor, type Session } from "@/lib/session";
import { DAY_MS } from "@/lib/time";
import { loadMap, ownWords } from "@/lib/wordmap-data";

/** Oslo calendar day of a moment, YYYY-MM-DD. */
export const osloDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

export interface PackPlan {
  steps: StepKind[];
  warmup: { wordIds: string[] };
  watch: { textId: string; title: string; kind: string; coverage: number | null; words: number } | null;
  words: { lemmas: string[] };
  talk: { scenarioId: string; title: string } | null;
  rule: { key: string; title: string } | null;
  /** another video on the theme, to show how much easier it became */
  next: { textId: string; title: string; coverage: number | null } | null;
}

export interface PackRow {
  id: string;
  lang: Lang;
  day: string;
  theme: string;
  minutes: PackMinutes;
  plan: PackPlan;
  progress: Record<string, string>;
  results: PackResults | null;
  status: "active" | "finished" | "cancelled";
  started_at: string;
  finished_at: string | null;
}

export interface PackResults {
  minutes: number;
  reviews: number;
  collected: { term: string; translation: string | null; status: string }[];
  keyKnown: number;
  keyLearning: number;
  said: string[];
  goals: { done: number; total: number } | null;
  selfFixed: number;
  watched: boolean;
  next: { title: string; before: number | null; after: number | null } | null;
}

const PACK_COLUMNS = "id,lang,day,theme,minutes,plan,progress,results,status,started_at,finished_at";
const asPack = (r: unknown) => r as PackRow;

/** Today's pack in this language: the active one, else the last finished one. */
export async function todayPack(s: Session, lang: Lang, now: number): Promise<PackRow | null> {
  const { data } = await s.supabase.from("packs").select(PACK_COLUMNS).eq("user_id", s.user.id).eq("lang", lang).eq("day", osloDay(now)).neq("status", "cancelled").order("started_at", { ascending: false }).limit(3);
  const rows = (data ?? []).map(asPack);
  return rows.find((p) => p.status === "active") ?? rows[0] ?? null;
}

export async function getPack(s: Session, id: string): Promise<PackRow | null> {
  const { data } = await s.supabase.from("packs").select(PACK_COLUMNS).eq("id", id).eq("user_id", s.user.id).maybeSingle();
  return data ? asPack(data) : null;
}

const fresh = (b: LibraryItem) => b.kind === "video" && b.availability === "in_app" && !b.progress?.finished && (b.coverage ?? 0) >= 0.88;
const inTheme = (b: LibraryItem, tags: string[]) => (b.tags ?? []).some((t) => tags.includes(t));

/** Three themes to choose from, with the reason for each (logged as a decision). */
export async function offerThemes(s: Session, lang: Lang, now: number) {
  const themes = PACK_THEMES.filter((t) => t.lang === lang);
  const [library, rates, packs, convs] = await Promise.all([
    libraryFor(s, lang),
    s.supabase.from("events").select("props").eq("user_id", s.user.id).eq("type", "read.rate").limit(500),
    s.supabase.from("packs").select("theme,day").eq("user_id", s.user.id).eq("lang", lang).neq("status", "cancelled").order("day", { ascending: false }).limit(60),
    s.supabase.from("conversations").select("scenario_id").eq("user_id", s.user.id).eq("lang", lang).limit(1000),
  ]);
  const byId = new Map(library.map((b) => [b.id, b]));
  const done = new Set((convs.data ?? []).map((c) => c.scenario_id));
  const lastDay = new Map<string, string>();
  for (const p of packs.data ?? []) if (!lastDay.has(p.theme)) lastDay.set(p.theme, p.day);
  const signals = new Map<string, ThemeSignals>();
  for (const t of themes) {
    const loved = (rates.data ?? []).filter((e) => {
      const p = e.props as { textId?: string; rating?: string };
      const b = p.textId ? byId.get(p.textId) : undefined;
      return p.rating === "loved" && !!b && inTheme(b, t.tags);
    }).length;
    const last = lastDay.get(t.key);
    signals.set(t.key, {
      freshMaterial: library.filter((b) => fresh(b) && inTheme(b, t.tags)).length,
      loved,
      daysSince: last ? Math.round((Date.parse(osloDay(now)) - Date.parse(last)) / DAY_MS) : null,
      untriedTalks: t.scenarios.filter((id) => !done.has(id)).length,
    });
  }
  const offer = chooseThemes(themes, signals);
  logEvent(s, "decision.pack_themes", { lang, offered: offer.map((o) => ({ theme: o.theme.key, score: Math.round(o.score * 10) / 10, reason: o.reason })) });
  return offer.map((o) => ({ key: o.theme.key, title: o.theme.title, reason: o.reason, videos: signals.get(o.theme.key)!.freshMaterial }));
}

/** Build and save a pack: the video, warm-up words, key words, conversation and rule for this theme and length. */
export async function createPack(s: Session, lang: Lang, themeKey: string, minutes: PackMinutes, now: number): Promise<PackRow> {
  const theme = themeOf(themeKey);
  if (!theme || theme.lang !== lang) throw new Error("unknown theme");
  const size = stepsFor(minutes);
  const nowIso = new Date(now).toISOString();
  const [library, due, scenarios, convs, fb] = await Promise.all([
    libraryFor(s, lang),
    s.supabase.from("words").select("id,pack_id,due").eq("user_id", s.user.id).eq("lang", lang).eq("status", "learning").lte("due", nowIso).order("due").limit(200),
    s.supabase.from("scenarios").select("id,title_ru").eq("lang", lang).eq("active", true).in("id", theme.scenarios),
    s.supabase.from("conversations").select("scenario_id").eq("user_id", s.user.id).eq("lang", lang).limit(1000),
    s.supabase.from("feedback_items").select("rule_key,status").eq("user_id", s.user.id).eq("lang", lang).gte("created_at", new Date(now - 45 * DAY_MS).toISOString()),
  ]);

  // the video: one she knows 90–96 % of, short enough for the length, not watched yet
  const candidates = library.filter((b) => fresh(b) && inTheme(b, theme.tags));
  const score = (b: LibraryItem) => Math.abs((b.coverage ?? 0) - 0.93) + ((b.word_count ?? 0) > size.maxVideoWords ? 1 : 0) + (b.progress ? 0.5 : 0);
  candidates.sort((a, b) => score(a) - score(b));
  const video = candidates[0] ?? null;
  const next = candidates.find((b) => b.id !== video?.id) ?? null;

  // warm-up: due words, those from earlier packs first
  const dueRows = (due.data ?? []).sort((a, b) => Number(!!b.pack_id) - Number(!!a.pack_id));
  const wordIds = dueRows.slice(0, size.reviewCards).map((w) => w.id);

  // key words of the video that she does not know yet
  let lemmas: string[] = [];
  if (video && size.keyWords) {
    const [{ data: vocab }, map, { own }] = await Promise.all([
      s.supabase.from("text_vocab").select("form,n,rank").eq("text_id", video.id).limit(5000),
      loadMap(s.supabase, lang),
      ownWordsFor(s.supabase, s.user.id, lang),
    ]);
    const known = { band: frequencyBand(lang, s.profile.levels[lang]?.reading ?? "B1"), own };
    lemmas = chooseKeyWords(
      (vocab ?? []).map((v) => ({ form: v.form, n: v.n, rank: v.rank })),
      (form) => isKnownForm(form, known, lang),
      (form) => {
        const w = map.byForm.get(form);
        return w ? { lemma: w.lemma, rank: w.rank } : undefined;
      },
      size.keyWords,
    );
  }

  // the conversation: the least practised one of the theme
  const times = new Map<string, number>();
  for (const c of convs.data ?? []) if (c.scenario_id) times.set(c.scenario_id, (times.get(c.scenario_id) ?? 0) + 1);
  const talkPick = size.steps.includes("talk")
    ? [...(scenarios.data ?? [])].sort((a, b) => (times.get(a.id) ?? 0) - (times.get(b.id) ?? 0) || theme.scenarios.indexOf(a.id) - theme.scenarios.indexOf(b.id))[0]
    : undefined;

  // the rule: her most frequent recent mistake that has a grammar topic
  const weight: Record<string, number> = {};
  for (const f of fb.data ?? []) if (f.rule_key) weight[f.rule_key] = (weight[f.rule_key] ?? 0) + (f.status === "self_fixed" ? 1 : 2);
  const ruleTopic = size.steps.includes("rule")
    ? (Object.entries(weight)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => GRAMMAR.find((g) => g.key === k))
        .find((g) => !!g) ?? GRAMMAR.find((g) => g.lang === lang))
    : undefined;

  const steps = size.steps.filter((k) => (k === "watch" ? !!video : k === "words" ? lemmas.length > 0 : k === "talk" ? !!talkPick : k === "rule" ? !!ruleTopic : true));
  const plan: PackPlan = {
    steps,
    warmup: { wordIds },
    watch: video ? { textId: video.id, title: video.title, kind: video.kind, coverage: video.coverage, words: video.word_count ?? 0 } : null,
    words: { lemmas },
    talk: talkPick ? { scenarioId: talkPick.id, title: talkPick.title_ru } : null,
    rule: ruleTopic ? { key: ruleTopic.key, title: ruleTopic.title } : null,
    next: next ? { textId: next.id, title: next.title, coverage: next.coverage } : null,
  };
  const { data, error } = await s.supabase
    .from("packs")
    .insert({ user_id: s.user.id, lang, day: osloDay(now), theme: theme.key, minutes, plan: plan as never })
    .select(PACK_COLUMNS)
    .single();
  if (error) throw error;
  logEvent(s, "decision.pack_plan", {
    reason: "theme chosen by her; video closest to 93 % known words; warm-up due words (earlier packs first); key words unknown and frequent in the video; least practised conversation; most frequent recent mistake",
    packId: data.id,
    theme: theme.key,
    minutes,
    textId: video?.id,
    coverage: video?.coverage,
    warmup: wordIds.length,
    keyWords: lemmas,
    scenario: talkPick?.id,
    rule: ruleTopic?.key,
  });
  return asPack(data);
}

export interface StepState {
  kind: StepKind;
  done: boolean;
  detail: string;
}

/** What is done in a pack, from what she did since it started; and the basket of words she saved in it. */
export async function packState(s: Session, pack: PackRow) {
  const [reviews, read, mine, convs, basket] = await Promise.all([
    pack.plan.warmup.wordIds.length
      ? s.supabase.from("reviews").select("word_id").eq("user_id", s.user.id).in("word_id", pack.plan.warmup.wordIds).gte("created_at", pack.started_at)
      : Promise.resolve({ data: [] as { word_id: string }[] }),
    pack.plan.watch ? s.supabase.from("reading_progress").select("finished_at").eq("user_id", s.user.id).eq("text_id", pack.plan.watch.textId).maybeSingle() : Promise.resolve({ data: null }),
    pack.plan.words.lemmas.length ? ownWords(s.supabase, s.user.id, pack.lang) : Promise.resolve([]),
    s.supabase.from("conversations").select("id,ended_at,goals_done").eq("user_id", s.user.id).eq("pack_id", pack.id).order("started_at", { ascending: false }),
    s.supabase.from("words").select("id,term,translation,status,created_at").eq("user_id", s.user.id).eq("pack_id", pack.id).order("created_at"),
  ]);
  const reviewed = new Set((reviews.data ?? []).map((r) => r.word_id)).size;
  const map = pack.plan.words.lemmas.length ? await loadMap(s.supabase, pack.lang) : null;
  const idx = statusIndex(mine as { term: string; lemma: string | null; status: string }[]);
  const marked = map ? pack.plan.words.lemmas.filter((l) => {
    const w = map.byLemma.get(l);
    return w && statusOf(w, idx) !== "new";
  }).length : 0;
  const talk = (convs.data ?? []).find((c) => c.ended_at);
  const watched = !!(read.data && "finished_at" in read.data && read.data.finished_at && read.data.finished_at >= pack.started_at);
  const steps: StepState[] = pack.plan.steps.map((kind) => {
    if (kind === "warmup") {
      const n = pack.plan.warmup.wordIds.length;
      return { kind, done: n === 0 || reviewed >= n, detail: n ? `${Math.min(reviewed, n)} из ${n}` : "сегодня нечего повторять" };
    }
    if (kind === "watch") return { kind, done: watched, detail: pack.plan.watch?.title ?? "" };
    if (kind === "words") return { kind, done: marked >= pack.plan.words.lemmas.length, detail: `${marked} из ${pack.plan.words.lemmas.length}` };
    if (kind === "talk") return { kind, done: !!talk, detail: pack.plan.talk?.title ?? "" };
    return { kind, done: !!pack.progress.rule, detail: pack.plan.rule?.title ?? "" };
  });
  return { steps, basket: basket.data ?? [], allDone: steps.every((x) => x.done), conversationId: talk?.id ?? null };
}

/** The extra goal of the pack's conversation, from the words of this pack (key words, then her saved ones). */
export async function packTalkGoal(s: Session, pack: PackRow) {
  const { data } = await s.supabase.from("words").select("term").eq("user_id", s.user.id).eq("pack_id", pack.id).limit(20);
  const map = await loadMap(s.supabase, pack.lang);
  const key = pack.plan.words.lemmas.map((l) => map.byLemma.get(l)?.display ?? l);
  const words = [...new Set([...key, ...(data ?? []).map((w) => w.term)])].map((w) => w.replace(/^(å|en|ei|et|to)\s+/i, ""));
  return words.length >= 3 ? packGoal(words) : null;
}

/** Finish a pack: work out what she did and learnt, save it, and log it. */
export async function finishPack(s: Session, pack: PackRow, now: number): Promise<PackResults> {
  const state = await packState(s, pack);
  const nowIso = new Date(now).toISOString();
  const [beats, revs, turns, fixes, map, mine] = await Promise.all([
    s.supabase.from("events").select("id", { count: "exact", head: true }).eq("user_id", s.user.id).eq("type", "activity.heartbeat").gte("created_at", pack.started_at).lte("created_at", nowIso),
    s.supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", s.user.id).gte("created_at", pack.started_at),
    state.conversationId ? s.supabase.from("conversation_turns").select("text").eq("conversation_id", state.conversationId).eq("role", "learner") : Promise.resolve({ data: [] as { text: string }[] }),
    state.conversationId ? s.supabase.from("feedback_items").select("id", { count: "exact", head: true }).eq("conversation_id", state.conversationId).eq("status", "self_fixed") : Promise.resolve({ count: 0 }),
    loadMap(s.supabase, pack.lang),
    ownWords(s.supabase, s.user.id, pack.lang),
  ]);
  const idx = statusIndex(mine);
  const keyStatus = pack.plan.words.lemmas.map((l) => map.byLemma.get(l)).filter((w) => !!w).map((w) => statusOf(w, idx));
  const packWords = [
    ...pack.plan.words.lemmas.map((l) => map.byLemma.get(l)).filter((w) => !!w),
    ...state.basket.map((b) => map.byForm.get(b.term.toLowerCase().replace(/^(å|en|ei|et|to)\s+/, "")) ?? { lemma: b.term.toLowerCase(), forms: [] as string[] }),
  ];
  const said = wordsSaid(packWords, (turns.data ?? []).map((t) => t.text));
  let goals: PackResults["goals"] = null;
  if (state.conversationId) {
    const { data: conv } = await s.supabase.from("conversations").select("goals_done,extra_goals,scenario_id").eq("id", state.conversationId).maybeSingle();
    const { data: sc } = conv?.scenario_id ? await s.supabase.from("scenarios").select("goals").eq("id", conv.scenario_id).maybeSingle() : { data: null };
    const total = ((sc?.goals as unknown[]) ?? []).length + ((conv?.extra_goals as unknown[]) ?? []).length;
    goals = { done: conv?.goals_done.length ?? 0, total };
  }
  // how much easier the next video on the theme became
  let next: PackResults["next"] = null;
  if (pack.plan.next) {
    const lib = await libraryFor(s, pack.lang);
    const after = lib.find((b) => b.id === pack.plan.next!.textId)?.coverage ?? null;
    next = { title: pack.plan.next.title, before: pack.plan.next.coverage, after };
  }
  const results: PackResults = {
    minutes: Math.round((beats.count ?? 0) / 2),
    reviews: revs.count ?? 0,
    collected: state.basket.map((b) => ({ term: b.term, translation: b.translation, status: b.status })),
    keyKnown: keyStatus.filter((x) => x === "known").length,
    keyLearning: keyStatus.filter((x) => x === "learning").length,
    said,
    goals,
    selfFixed: fixes.count ?? 0,
    watched: state.steps.find((x) => x.kind === "watch")?.done ?? false,
    next,
  };
  const { error } = await s.supabase.from("packs").update({ status: "finished", finished_at: nowIso, results: results as never }).eq("id", pack.id).eq("user_id", s.user.id);
  if (error) throw error;
  logEvent(s, "pack.finish", { packId: pack.id, theme: pack.theme, minutes: pack.minutes, stepsDone: state.steps.filter((x) => x.done).map((x) => x.kind), results });
  return results;
}
