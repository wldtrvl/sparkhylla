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
