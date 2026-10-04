/**
 * Text fit: what share of a text's running words the learner already knows.
 * Known = her own known/learning words + the N most frequent words for her reading level
 * (frequency lists: hermitdave/FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0).
 * Research on reading suggests ~95–98% known words for comfortable independent reading.
 */
import freqNo from "@/data/freq-no.json";
import freqEn from "@/data/freq-en.json";

export type Lang = "no" | "en";

/** Approximate vocabulary size assumed at each CEFR reading level (top-N frequency band). */
export const LEVEL_BAND: Record<string, number> = { A1: 700, A2: 1500, B1: 3000, B2: 5000, C1: 8000, C2: 12000 };

const FREQ: Record<Lang, string[]> = { no: freqNo as string[], en: freqEn as string[] };
const bandCache = new Map<string, Set<string>>();

/** How many of the most frequent words count as known at a reading level. */
export function bandSize(level: string): number {
  return LEVEL_BAND[level.replace("+", "")] ?? 3000;
}

export function frequencyBand(lang: Lang, level: string): Set<string> {
  const n = bandSize(level);
  const key = `${lang}:${n}`;
  let s = bandCache.get(key);
  if (!s) {
    s = new Set(FREQ[lang].slice(0, n));
    bandCache.set(key, s);
  }
  return s;
}

export interface Token {
  text: string; // as written
  norm: string; // lowercased word form; "" for punctuation / spaces
  start: number;
  sentenceStart: boolean;
}

const WORD = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

/** Splits text into word tokens with positions (non-words are the gaps between them). */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(text))) {
    const gap = text.slice(lastEnd, m.index);
    const sentenceStart = out.length === 0 || /[.!?…:«“"—–]\s*$/.test(gap) || /\n/.test(gap);
    out.push({ text: m[0], norm: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, sentenceStart });
    lastEnd = m.index + m[0].length;
  }
  return out;
}

export interface KnownSets {
  band: Set<string>;
  own: Set<string>; // learner's own words (any status) — lowercase forms and lemmas
}

/** Capitalised mid-sentence → proper noun (names, places): never counted as unknown. */
export const isProperNoun = (tok: Token) => !tok.sentenceStart && /^\p{Lu}/u.test(tok.text);

/** A word form is known if it is hers or in her frequency band; hyphenated compounds if every part is. */
export function isKnownForm(norm: string, known: KnownSets): boolean {
  if (known.own.has(norm) || known.band.has(norm)) return true;
  if (norm.includes("-")) return norm.split("-").every((p) => known.own.has(p) || known.band.has(p));
  return false;
}

export function isKnown(tok: Token, known: KnownSets): boolean {
  return isProperNoun(tok) || isKnownForm(tok.norm, known);
}

export interface CoverageResult {
  total: number;
  known: number;
  coverage: number; // 0..1
  unknown: string[]; // distinct unknown forms, in order of appearance
}

export function coverage(text: string, known: KnownSets): CoverageResult {
  const toks = tokenize(text);
  let k = 0;
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const t of toks) {
    if (isKnown(t, known)) k++;
    else if (!seen.has(t.norm)) {
      seen.add(t.norm);
      unknown.push(t.norm);
    }
  }
  return { total: toks.length, known: k, coverage: toks.length ? k / toks.length : 1, unknown };
}

export type FitGroup = "fits" | "stretch" | "later";
/** fits: ≥95% known; stretch: 90–95%; later: below 90%. */
export function fitGroup(cov: number): FitGroup {
  if (cov >= 0.95) return "fits";
  if (cov >= 0.9) return "stretch";
  return "later";
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
/** For external books without full text: compare editor's level estimate with her reading level. */
export function fitFromLevel(textLevel: string | null, readerLevel: string): FitGroup {
  const t = LEVELS.indexOf((textLevel ?? "B1").replace("+", ""));
  const r = LEVELS.indexOf(readerLevel.replace("+", ""));
  if (t <= r) return "fits";
  if (t === r + 1) return "stretch";
  return "later";
}

/* ---------- per-book vocabulary (stored in text_vocab, coverage computed in SQL by text_fit) ---------- */

export interface VocabEntry {
  form: string;
  n: number;
  /** 1-based position in the language's frequency list; null if not listed. Known at a level when rank <= bandSize. */
  rank: number | null;
  /** hyphenated compounds: the parts and their ranks, so "known if every part is known" works in SQL */
  parts: string[] | null;
  part_ranks: (number | null)[] | null;
}

export interface TextVocab {
  tokens: number; // all word tokens
  proper: number; // proper-noun tokens (always known)
  entries: VocabEntry[];
}

const rankCache = new Map<Lang, Map<string, number>>();
function rankOf(lang: Lang): Map<string, number> {
  let m = rankCache.get(lang);
  if (!m) {
    m = new Map();
    FREQ[lang].forEach((w, i) => m!.has(w) || m!.set(w, i + 1));
    rankCache.set(lang, m);
  }
  return m;
}

/** Distinct word forms of a text with counts and frequency ranks: everything coverage needs, without the text. */
export function buildVocab(text: string, lang: Lang): TextVocab {
  const ranks = rankOf(lang);
  const counts = new Map<string, number>();
  let proper = 0;
  const toks = tokenize(text);
  for (const t of toks) {
    if (isProperNoun(t)) proper++;
    else counts.set(t.norm, (counts.get(t.norm) ?? 0) + 1);
  }
  const entries: VocabEntry[] = [];
  for (const [form, n] of counts) {
    const parts = form.includes("-") ? form.split("-") : null;
    entries.push({ form, n, rank: ranks.get(form) ?? null, parts, part_ranks: parts ? parts.map((p) => ranks.get(p) ?? null) : null });
  }
  return { tokens: toks.length, proper, entries };
}

/** Same result as coverage(text, known), computed from the stored vocabulary. Mirrors SQL text_fit(). */
export function coverageFromVocab(v: TextVocab, own: Set<string>, band: number): number {
  const inBand = (r: number | null) => r != null && r <= band;
  let known = v.proper;
  for (const e of v.entries) {
    if (inBand(e.rank) || own.has(e.form) || (e.parts && e.parts.every((p, i) => inBand(e.part_ranks![i]) || own.has(p)))) known += e.n;
  }
  return v.tokens ? known / v.tokens : 1;
}
