/**
 * «Карта слов»: the most used words of a language up to B2, by level and part of speech, with the
 * basic words (gjøre, ta, stor) as roots that harder words branch from. Pure logic, shared by the page,
 * the API and the build script (scripts/build-wordmap.ts).
 */
import { LEVEL_BAND } from "./coverage";

export type MapLevel = "A1" | "A2" | "B1" | "B2";
export const MAP_LEVELS: MapLevel[] = ["A1", "A2", "B1", "B2"];
/** The map covers the frequency list up to the B2 band (5000 forms). */
export const MAP_MAX_RANK = LEVEL_BAND.B2;

export const POS = ["verb", "noun", "adj", "adv", "pron", "prep", "conj", "num", "interj", "other"] as const;
export type Pos = (typeof POS)[number];
export const POS_LABEL: Record<Pos, string> = {
  verb: "Глаголы",
  noun: "Существительные",
  adj: "Прилагательные",
  adv: "Наречия",
  pron: "Местоимения",
  prep: "Предлоги",
  conj: "Союзы",
  num: "Числительные",
  interj: "Междометия",
  other: "Другие",
};
/** Content words can be roots of a tree; function words cannot. */
export const CONTENT_POS = new Set<Pos>(["verb", "noun", "adj", "adv"]);
export const asPos = (p: string | null | undefined): Pos => ((POS as readonly string[]).includes(p ?? "") ? (p as Pos) : "other");

export const THEMES = {
  actions: "Действия и движение",
  mind: "Мысли и общение",
  feelings: "Чувства и характер",
  qualities: "Свойства и оценки",
  people: "Люди и семья",
  body: "Тело и здоровье",
  food: "Еда и напитки",
  home: "Дом и быт",
  clothes: "Одежда и внешность",
  city: "Город и места",
  travel: "Транспорт и поездки",
  nature: "Природа, погода, животные",
  time: "Время и календарь",
  quantity: "Числа и количество",
  work: "Работа и учёба",
  money: "Деньги и покупки",
  society: "Общество и государство",
  culture: "Культура и отдых",
  tech: "Техника и связь",
  grammar: "Служебные слова",
} as const;
export type Theme = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as Theme[];

/** Level of a frequency rank (1 = most frequent), in the same bands as the reading fit. */
export function levelForRank(rank: number): MapLevel | null {
  for (const l of MAP_LEVELS) if (rank <= LEVEL_BAND[l]) return l;
  return null;
}

/** «Å gå», «en bil», «to go», «The» → «gå», «bil», «go», «the»: how map lemmas and her words are compared. */
export function normalizeTerm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^(å|en|ei|et|to|a|an|the)\s+/, "")
    .replace(/[.,!?;:«»"“”]+$/g, "");
}

export interface MapWord {
  lemma: string;
  display: string;
  pos: Pos;
  forms: string[];
  rank: number;
  level: MapLevel;
  theme: Theme | null;
  translation: string;
  root: string | null;
}

export type WordStatus = "known" | "learning" | "new";

/** Her words (term/lemma/status) as lookups for the map: any saved form or lemma marks the whole map word. */
export function statusIndex(words: { term: string; lemma: string | null; status: string }[]): Map<string, WordStatus> {
  const idx = new Map<string, WordStatus>();
  const put = (k: string, st: WordStatus) => {
    if (!k) return;
    const cur = idx.get(k);
    if (cur === "known" || (cur === "learning" && st !== "known")) return;
    idx.set(k, st);
  };
  for (const w of words) {
    const st: WordStatus | null = w.status === "known" ? "known" : w.status === "learning" ? "learning" : null;
    if (!st) continue;
    put(normalizeTerm(w.term), st);
    if (w.lemma) put(normalizeTerm(w.lemma), st);
  }
  return idx;
}

export function statusOf(w: Pick<MapWord, "lemma" | "forms">, idx: Map<string, WordStatus>): WordStatus {
  let best: WordStatus = "new";
  for (const k of [w.lemma, ...w.forms]) {
    const st = idx.get(k);
    if (st === "known") return "known";
    if (st === "learning") best = "learning";
  }
  return best;
}

export interface Tally {
  total: number;
  known: number;
  learning: number;
}
const tally = (): Tally => ({ total: 0, known: 0, learning: 0 });
function count(t: Tally, st: WordStatus) {
  t.total++;
  if (st === "known") t.known++;
  if (st === "learning") t.learning++;
}

/** Progress per level, per level × part of speech, and per theme. */
export function progress(words: MapWord[], st: (w: MapWord) => WordStatus) {
  const all = tally();
  const byLevel = Object.fromEntries(MAP_LEVELS.map((l) => [l, tally()])) as Record<MapLevel, Tally>;
  const byLevelPos = new Map<string, Tally>();
  const byTheme = new Map<Theme, Tally>();
  for (const w of words) {
    const s = st(w);
    count(all, s);
    count(byLevel[w.level], s);
    const k = `${w.level}:${w.pos}`;
    if (!byLevelPos.has(k)) byLevelPos.set(k, tally());
    count(byLevelPos.get(k)!, s);
    if (w.theme) {
      if (!byTheme.has(w.theme)) byTheme.set(w.theme, tally());
      count(byTheme.get(w.theme)!, s);
    }
  }
  return { all, byLevel, byLevelPos, byTheme };
}

/** The first level she has not mostly marked (≥ 80 % known): where the map opens. */
export function focusLevel(byLevel: Record<MapLevel, Tally>): MapLevel {
  return MAP_LEVELS.find((l) => byLevel[l].total && byLevel[l].known / byLevel[l].total < 0.8) ?? "B2";
}

/** Trees: each root with the words that branch from it, ordered by frequency; words without a root last. */
export function trees<T extends Pick<MapWord, "lemma" | "root" | "rank">>(words: T[], roots: Map<string, T>) {
  const groups = new Map<string, T[]>();
  const loose: T[] = [];
  for (const w of words) {
    if (w.root && w.root !== w.lemma && roots.has(w.root)) {
      if (!groups.has(w.root)) groups.set(w.root, []);
      groups.get(w.root)!.push(w);
    }
  }
  // a basic word with nothing under it here is listed with the other words, not as a one-word tree
  for (const w of words) if (!(w.root && w.root !== w.lemma && roots.has(w.root)) && !groups.has(w.lemma)) loose.push(w);
  const out = [...groups.entries()].map(([root, branch]) => ({ root: roots.get(root)!, branch: branch.sort((a, b) => a.rank - b.rank) }));
  out.sort((a, b) => a.root.rank - b.root.rank);
  return { trees: out, loose: loose.sort((a, b) => a.rank - b.rank) };
}

export interface SavedWord {
  id: string;
  term: string;
  lemma: string | null;
  status: string;
}

/**
 * What a mark on the map changes in her words. A group «Знаю» never touches words in review (only a tap on
 * that one word does), «none» only removes «знаю» marks, and nothing here deletes a word in review.
 */
export function planMarks(targets: Pick<MapWord, "lemma" | "forms">[], mine: SavedWord[], status: "known" | "learning" | "none", single: boolean) {
  const idx = statusIndex(mine);
  const plan = { insert: [] as string[], toKnown: [] as string[], toLearning: [] as string[], remove: [] as string[] };
  for (const w of targets) {
    const keys = new Set([w.lemma, ...w.forms]);
    const rows = mine.filter((m) => keys.has(normalizeTerm(m.term)) || (m.lemma && keys.has(normalizeTerm(m.lemma))));
    const st = statusOf(w, idx);
    if (status === "none") plan.remove.push(...rows.filter((r) => r.status === "known").map((r) => r.id));
    else if (st === status) continue;
    else if (st === "new") plan.insert.push(w.lemma);
    else if (status === "known" && single) plan.toKnown.push(...rows.filter((r) => r.status === "learning").map((r) => r.id));
    else if (status === "learning") plan.toLearning.push(...rows.filter((r) => r.status === "known").map((r) => r.id));
  }
  return plan;
}
