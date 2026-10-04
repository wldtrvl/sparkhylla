/**
 * Book bodies are plain text: paragraphs separated by blank lines. A paragraph starting with "## " is a
 * heading (a tale or chapter title): it starts a new page and is shown as a title, not as a paragraph.
 */
export const HEADING_PREFIX = "## ";
export const isHeading = (p: string) => p.startsWith(HEADING_PREFIX);
export const paragraphText = (p: string) => (isHeading(p) ? p.slice(HEADING_PREFIX.length) : p);

/** Split a body into pages of whole paragraphs (~1600 characters each). A heading always starts a new page. */
export function paginate(body: string, target = 1600): string[][] {
  const paras = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const pages: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    if (len > 0 && (len + p.length > target || isHeading(p))) {
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
