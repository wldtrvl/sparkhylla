/**
 * Text fit: what share of a text's running words the learner already knows.
 * Known = her own known/learning words + the N most frequent words for her reading level
 * (frequency lists: hermitdave/FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0).
 * Research on reading suggests ~95–98% known words for comfortable independent reading.
 */
import freqNo from "@/data/freq-no.json";
import { WORD_PATTERN } from "@/lib/text-format";
import freqEn from "@/data/freq-en.json";

export type Lang = "no" | "en";

/** Approximate vocabulary size assumed at each CEFR reading level (top-N frequency band). */
export const LEVEL_BAND: Record<string, number> = { A1: 700, A2: 1500, B1: 3000, B2: 5000, C1: 8000, C2: 12000 };

const FREQ: Record<Lang, string[]> = { no: freqNo as string[], en: freqEn as string[] };
const bandCache = new Map<string, Set<string>>();

/** Norwegian or English? Compares how many tokens fall in each language's 300 most frequent words. */
export function guessLang(text: string): Lang {
  const toks = tokenize(text.slice(0, 20_000));
  const score = (l: Lang) => {
    const top = new Set(FREQ[l].slice(0, 300));
    return toks.filter((t) => top.has(t.norm)).length;
  };
  return score("no") >= score("en") ? "no" : "en";
}

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

const WORD = new RegExp(WORD_PATTERN.source, "gu");

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

/**
 * Older Norwegian spellings (riksmål before 1938, common in public-domain books) → today's bokmål form.
 * A word counts as known when its modern form is known, so "sig" is not flagged for someone who knows "seg".
 */
const MODERN_NO: Record<string, string> = {
  sig: "seg", mig: "meg", dig: "deg", vilde: "ville", kunde: "kunne", skulde: "skulle", blev: "ble", op: "opp",
  hvad: "hva", nu: "nå", ennu: "ennå", drog: "dro", mere: "mer", hverken: "verken", igjennem: "igjennom",
  idag: "dag", imorgen: "morgen", igaar: "går", igår: "går", hvorledes: "hvordan", // i dag, i morgen, i går
  // Dano-Norwegian before 1907 (Aanrud, Zwilgmeyer, early Undset)
  ud: "ut", gik: "gikk", fik: "fikk", havde: "hadde", sagde: "sa", spurgte: "spurte", altid: "alltid", lidt: "litt", sige: "si",
};

/** Today's spelling of an older form (Norwegian only), or null when the form is already modern. */
export function modernForm(norm: string, lang: Lang): string | null {
  if (lang !== "no") return null;
  const m = MODERN_NO[norm] ?? (norm.startsWith("efter") ? `etter${norm.slice(5)}` : norm.includes("aa") ? norm.replaceAll("aa", "å") : null);
  return m && m !== norm ? m : null;
}

export interface KnownSets {
  band: Set<string>;
  own: Set<string>; // learner's own words (any status) — lowercase forms and lemmas
}

/** Capitalised mid-sentence → proper noun (names, places): never counted as unknown. */
export const isProperNoun = (tok: Token) => !tok.sentenceStart && /^\p{Lu}/u.test(tok.text);

/**
 * Forms that are names throughout a text: capitalised mid-sentence somewhere and never written in
 * lowercase. Then "Halvor" at the start of a sentence is a name too, not an unknown word.
 */
export function nameForms(toks: Token[]): Set<string> {
  const capitalised = new Set<string>();
  const lower = new Set<string>();
  for (const t of toks) {
    if (isProperNoun(t)) capitalised.add(t.norm);
    else if (!/^\p{Lu}/u.test(t.text)) lower.add(t.norm);
  }
  for (const f of lower) capitalised.delete(f);
  return capitalised;
}

/**
 * A word form is known if it (or its modern spelling) is hers or in her band; a hyphenated or (Norwegian)
 * closed compound if every part is: "naturopplevelse" = natur + opplevelse.
 */
export function isKnownForm(norm: string, known: KnownSets, lang?: Lang): boolean {
  if (known.own.has(norm) || known.band.has(norm)) return true;
  const modern = lang ? modernForm(norm, lang) : null;
  if (modern && (known.own.has(modern) || known.band.has(modern))) return true;
  const parts = wordParts(modern ?? norm, lang); // old spelling: split the modern form (gaardshunden → gård + hunden)
  return !!parts && parts.every((p) => known.own.has(p) || known.band.has(p));
}

export function isKnown(tok: Token, known: KnownSets, names: Set<string> = new Set(), lang?: Lang): boolean {
  return isProperNoun(tok) || names.has(tok.norm) || isKnownForm(tok.norm, known, lang);
}

export interface CoverageResult {
  total: number;
  known: number;
  coverage: number; // 0..1
  unknown: string[]; // distinct unknown forms, in order of appearance
}

/** `names`: pass the whole book's name forms when checking one page, so a name is recognised on every page. */
export function coverage(text: string, known: KnownSets, lang?: Lang, names?: Set<string>): CoverageResult {
  const toks = tokenize(text);
  names ??= nameForms(toks);
  let k = 0;
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const t of toks) {
    if (isKnown(t, known, names, lang)) k++;
    else if (!seen.has(t.norm)) {
      seen.add(t.norm);
      unknown.push(t.norm);
    }
  }
  return { total: toks.length, known: k, coverage: toks.length ? k / toks.length : 1, unknown };
}

export type FitGroup = "fits" | "stretch" | "later";
/**
 * fits: ≥90% known; stretch: 85–90%; later: below 85%. She reads with word lookup and «Перевод рядом»,
 * so assisted reading starts lower than the 95–98% research target for reading without help.
 */
export function fitGroup(cov: number): FitGroup {
  if (cov >= 0.9) return "fits";
  if (cov >= 0.85) return "stretch";
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
  /** today's spelling of an older form (sig → seg); rank above already falls back to it */
  alt: string | null;
  /** hyphenated compounds: the parts and their ranks, so "known if every part is known" works in SQL */
  parts: string[] | null;
  part_ranks: (number | null)[] | null;
}

export interface TextVocab {
  tokens: number; // all word tokens
  proper: number; // name tokens (always known): capitalised mid-sentence, or a form only ever written capitalised
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

const minRank = (a?: number, b?: number) => (a == null ? (b ?? null) : b == null ? a : Math.min(a, b));

/**
 * Parts of a compound: hyphenated words split at "-"; a Norwegian word that is not in the frequency list is
 * split into 2–3 listed words (each at least 3 letters, optionally joined by a linking -s- or -e-), choosing
 * the split whose rarest part is most common. null when the word is listed or cannot be split.
 * Depends only on the frequency list, so the stored vocabulary and the live check always agree.
 */
const partsCache = new Map<string, string[] | null>();
export function wordParts(norm: string, lang?: Lang): string[] | null {
  if (norm.includes("-")) return norm.split("-");
  if (lang !== "no" || norm.length < 7) return null;
  const ranks = rankOf("no");
  if (ranks.has(norm)) return null;
  const hit = partsCache.get(norm);
  if (hit !== undefined) return hit;
  const split = (w: string, depth: number): { parts: string[]; max: number } | null => {
    let best: { parts: string[]; max: number } | null = null;
    for (let i = 3; i <= w.length - 3; i++) {
      for (const link of ["", "s", "e"]) {
        const head = w.slice(0, i);
        if (link && !head.endsWith(link)) continue;
        const stem = link ? head.slice(0, -1) : head;
        const r = ranks.get(stem);
        if (stem.length < 3 || !r) continue;
        const tail = w.slice(i);
        const tr = ranks.get(tail);
        const cand = tr ? { parts: [stem, tail], max: Math.max(r, tr) } : depth < 2 ? ((x) => (x ? { parts: [stem, ...x.parts], max: Math.max(r, x.max) } : null))(split(tail, depth + 1)) : null;
        if (cand && (!best || cand.max < best.max)) best = cand;
      }
    }
    return best;
  };
  const parts = split(norm, 1)?.parts ?? null;
  partsCache.set(norm, parts);
  return parts;
}

/** Distinct word forms of a text with counts and frequency ranks: everything coverage needs, without the text. */
export function buildVocab(text: string, lang: Lang): TextVocab {
  const ranks = rankOf(lang);
  const counts = new Map<string, number>();
  let proper = 0;
  const toks = tokenize(text);
  const names = nameForms(toks);
  for (const t of toks) {
    if (isProperNoun(t) || names.has(t.norm)) proper++;
    else counts.set(t.norm, (counts.get(t.norm) ?? 0) + 1);
  }
  const entries: VocabEntry[] = [];
  for (const [form, n] of counts) {
    const alt = modernForm(form, lang);
    const parts = wordParts(alt ?? form, lang);
    entries.push({
      form,
      n,
      rank: minRank(ranks.get(form), alt ? ranks.get(alt) : undefined),
      alt,
      parts,
      part_ranks: parts ? parts.map((p) => ranks.get(p) ?? null) : null,
    });
  }
  return { tokens: toks.length, proper, entries };
}

/** Same result as coverage(text, known), computed from the stored vocabulary. Mirrors SQL text_fit(). */
export function coverageFromVocab(v: TextVocab, own: Set<string>, band: number): number {
  const inBand = (r: number | null) => r != null && r <= band;
  let known = v.proper;
  for (const e of v.entries) {
    if (inBand(e.rank) || own.has(e.form) || (e.alt != null && own.has(e.alt)) || (e.parts && e.parts.every((p, i) => inBand(e.part_ranks![i]) || own.has(p)))) known += e.n;
  }
  return v.tokens ? known / v.tokens : 1;
}
