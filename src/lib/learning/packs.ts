/**
 * «Набор дня»: one theme for a day — a warm-up review, a video on the theme, its key words, a conversation, a
 * rule — and a result at the end. Pure logic (themes, which steps a length has, choosing themes and key words,
 * which pack words she said aloud); data loading lives in src/lib/packs-data.ts.
 */
import { normalizeTerm } from "./wordmap";

export type PackMinutes = 15 | 30 | 45;
export const PACK_MINUTES: PackMinutes[] = [15, 30, 45];
export type StepKind = "warmup" | "watch" | "words" | "talk" | "rule";

/** Which steps a pack of a given length has, and how big they are. */
export function stepsFor(minutes: PackMinutes): { steps: StepKind[]; reviewCards: number; keyWords: number; maxVideoWords: number } {
  if (minutes === 15) return { steps: ["warmup", "watch"], reviewCards: 5, keyWords: 0, maxVideoWords: 600 };
  if (minutes === 30) return { steps: ["warmup", "watch", "words", "talk"], reviewCards: 10, keyWords: 6, maxVideoWords: 1100 };
  return { steps: ["warmup", "watch", "words", "talk", "rule"], reviewCards: 10, keyWords: 8, maxVideoWords: 1700 };
}

export const STEP_LABEL: Record<StepKind, string> = {
  warmup: "Разминка: повторить слова",
  watch: "Смотреть",
  words: "Слова набора",
  talk: "Говорить",
  rule: "Правило",
};

export interface PackTheme {
  key: string;
  lang: "no" | "en";
  title: string;
  /** texts.tags that belong to it */
  tags: string[];
  /** conversations that fit it, best first */
  scenarios: string[];
}

export const PACK_THEMES: PackTheme[] = [
  { key: "work", lang: "no", title: "Работа", tags: ["work"], scenarios: ["no-interview-shop", "no-first-day", "no-sick-call", "no-customer", "no-coffee"] },
  { key: "care", lang: "no", title: "Уход и забота", tags: ["care"], scenarios: ["no-interview-care", "no-volunteer", "no-legevakt"] },
  { key: "health", lang: "no", title: "Здоровье", tags: ["health"], scenarios: ["no-fastlege", "no-pharmacy", "no-dentist", "no-legevakt", "no-doctor"] },
  { key: "home", lang: "no", title: "Дом, семья и еда", tags: ["home"], scenarios: ["no-dinner", "no-landlord", "no-visning", "no-neighbour"] },
  { key: "society", lang: "no", title: "Общество и деньги", tags: ["society"], scenarios: ["no-nav", "no-bank", "no-parcel"] },
  { key: "nature", lang: "no", title: "Природа и поездки", tags: ["nature"], scenarios: ["no-bus", "no-neighbour"] },
  { key: "culture", lang: "no", title: "Культура и язык", tags: ["culture"], scenarios: ["no-dinner", "no-coffee", "no-hairdresser"] },
  { key: "media", lang: "no", title: "Новости и общение", tags: ["media"], scenarios: ["no-coffee", "no-neighbour"] },
  { key: "everyday", lang: "en", title: "Повседневная жизнь", tags: ["everyday"], scenarios: ["en-introduce", "en-cafe", "en-shop", "en-supermarket", "en-restaurant"] },
  { key: "expressions", lang: "en", title: "Живые выражения", tags: ["expressions"], scenarios: ["en-phone-booking", "en-hotel-problem", "en-restaurant", "en-cafe"] },
  { key: "news", lang: "en", title: "Слова из новостей и поездки", tags: ["news"], scenarios: ["en-airport", "en-train", "en-taxi", "en-lost-bag", "en-directions", "en-hotel"] },
];
export const themeOf = (key: string) => PACK_THEMES.find((t) => t.key === key);

export interface ThemeSignals {
  /** videos on the theme she has not finished and that fit her (≥ 88 % known words) */
  freshMaterial: number;
  /** her «Очень» ratings on texts of this theme */
  loved: number;
  /** days since she last did a pack on it (null: never) */
  daysSince: number | null;
  /** scenarios of the theme she has never done */
  untriedTalks: number;
}

/**
 * Three themes to offer: there must be something to watch; then what she loves, what she has not done lately,
 * and new conversations. Returns the reason for each, for the decision log.
 */
export function chooseThemes(themes: PackTheme[], signals: Map<string, ThemeSignals>, n = 3) {
  return themes
    .map((t) => {
      const s = signals.get(t.key);
      if (!s || s.freshMaterial === 0) return null;
      const recency = s.daysSince == null ? 3 : Math.min(3, s.daysSince / 2);
      const score = Math.min(s.loved, 4) * 1.5 + recency + Math.min(s.untriedTalks, 2) + Math.min(s.freshMaterial, 5) * 0.3;
      const reason = [s.loved ? `понравилось: ${s.loved}` : null, s.daysSince == null ? "ещё не было" : `был ${s.daysSince} дн. назад`, s.untriedTalks ? `новых разговоров: ${s.untriedTalks}` : null]
        .filter(Boolean)
        .join(", ");
      return { theme: t, score, reason };
    })
    .filter((x) => !!x)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * Key words of a text for her: words she does not know yet (outside her level band, not in her words), useful
 * (in the 5000 most frequent), most repeated in the text first, then most frequent in the language.
 */
export function chooseKeyWords(
  vocab: { form: string; n: number; rank: number | null }[],
  isKnown: (form: string) => boolean,
  toLemma: (form: string) => { lemma: string; rank: number } | undefined,
  k: number,
): string[] {
  const best = new Map<string, { lemma: string; n: number; rank: number }>();
  for (const v of vocab) {
    if (isKnown(v.form)) continue;
    const m = toLemma(v.form);
    if (!m || m.rank > 5000) continue;
    const cur = best.get(m.lemma);
    best.set(m.lemma, { lemma: m.lemma, n: (cur?.n ?? 0) + v.n, rank: m.rank });
  }
  return [...best.values()].sort((a, b) => b.n - a.n || a.rank - b.rank).slice(0, k).map((x) => x.lemma);
}

/** Pack words she actually said in the conversation: any form of the word in one of her turns. */
export function wordsSaid(words: { lemma: string; forms: string[] }[], turns: string[]): string[] {
  const said = new Set((turns.join(" ").toLowerCase().match(/[\p{L}'’-]+/gu) ?? []).map((w) => normalizeTerm(w)));
  return words.filter((w) => [w.lemma, ...w.forms].some((f) => said.has(f.toLowerCase()))).map((w) => w.lemma);
}

/** The goal a pack adds to its conversation. */
export function packGoal(words: string[]) {
  const shown = words.slice(0, 6).join(", ");
  return { id: "pack_words", ru: `Использовать 3 слова из набора: ${shown}` };
}
