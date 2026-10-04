/**
 * Book bodies are plain text: paragraphs separated by blank lines. A paragraph starting with "## " is a
 * heading (a tale or chapter title): it starts a new page and is shown as a title, not as a paragraph.
 */
export const HEADING_PREFIX = "## ";

/** One word as the app counts it: letters, joined by an apostrophe or hyphen (hus, ku-ku, don't). */
export const WORD_PATTERN = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

/** The HTML lang attribute for a learning language (Norwegian Bokmål is "nb"). */
export const htmlLang = (lang: "no" | "en") => (lang === "no" ? "nb" : "en");
export const isHeading = (p: string) => p.startsWith(HEADING_PREFIX);
export const paragraphText = (p: string) => (isHeading(p) ? p.slice(HEADING_PREFIX.length) : p);

/**
 * Split a body into pages of whole paragraphs (~1600 characters each). A heading starts a new page once the
 * current one is a third full: each tale opens on its own page, while short article sections share one.
 */
export function paginate(body: string, target = 1600): string[][] {
  const paras = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const pages: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    if (len > 0 && (len + p.length > target || (isHeading(p) && len >= target / 3))) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[""]];
}

/** Abbreviations that end with a full stop but do not end a sentence (English and Norwegian). */
const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|etc|e\.g|i\.e|f\.eks|bl\.a|ca|nr|kl|osv|dvs|mht|pga|ev|jf)\.$/i;

/**
 * Split a paragraph into sentences for sentence-by-sentence translation: after . ! ? … (and any closing
 * quote or bracket) when the next sentence starts with a capital, a digit or an opening quote or dash.
 */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.trim();
  if (!text) return [];
  const out: string[] = [];
  const re = /[.!?…]+["»”’)\]]*\s+(?=["«“‘(\[–—-]*\s*[\p{Lu}\d])/gu;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const candidate = text.slice(start, end);
    if (ABBREVIATIONS.test(candidate) || /(^|\s)\p{Lu}\.$/u.test(candidate)) continue; // "Mr." or an initial "J."
    out.push(candidate.trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}
