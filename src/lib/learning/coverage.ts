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

export function frequencyBand(lang: Lang, level: string): Set<string> {
  const n = LEVEL_BAND[level.replace("+", "")] ?? 3000;
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

export function isKnown(tok: Token, known: KnownSets): boolean {
  if (known.own.has(tok.norm) || known.band.has(tok.norm)) return true;
  // Capitalised mid-sentence → proper noun (names, places): don't count as unknown
  if (!tok.sentenceStart && /^\p{Lu}/u.test(tok.text)) return true;
  // hyphenated compounds: known if every part is known
  if (tok.norm.includes("-")) return tok.norm.split("-").every((p) => known.own.has(p) || known.band.has(p));
  return false;
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
