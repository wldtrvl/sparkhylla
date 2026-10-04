import { parse, type HTMLElement } from "node-html-parser";
import { HEADING_PREFIX } from "@/lib/text-format";

/** Everything that is not running text: tables, notes, navigation, page numbers, edit links. */
const SKIP = [
  "table", "figure", "figcaption", "sup", "style", "script", "noscript", "img", "math",
  ".reference", ".mw-references-wrap", ".references", ".infobox", ".navbox", ".thumb", ".gallery", ".noprint",
  ".mw-editsection", ".metadata", ".hatnote", ".toc", ".pagenum", ".ws-pagenum", ".ws-header", "#headertemplate",
  ".mw-empty-elt", "nav",
].join(",");

/** Sections after which an encyclopedia article has no more running text. */
const STOP_HEADINGS = /^(referanser|litteratur|eksterne lenker|se også|kilder|noter|fotnoter|references|external links|see also|further reading|notes|bibliography|sources)$/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Turn article or book HTML into the app's body format: paragraphs separated by blank lines,
 * headings as "## " paragraphs. Stops at reference sections.
 */
export function htmlToBody(html: string, opts: { headings?: string; root?: string } = {}): string {
  const doc = parse(html);
  doc.querySelectorAll(SKIP).forEach((n) => n.remove());
  const scope: HTMLElement = (opts.root && doc.querySelector(opts.root)) || doc;
  const headingTags = opts.headings ?? "h2, h3";
  const out: string[] = [];
  for (const el of scope.querySelectorAll(`p, ${headingTags}`)) {
    const text = clean(el.text);
    if (!text || /^[\d\W]+$/u.test(text)) continue;
    if (el.tagName !== "P") {
      if (STOP_HEADINGS.test(text)) break;
      out.push(HEADING_PREFIX + text);
    } else out.push(text);
  }
  // drop headings with nothing under them (empty sections)
  return out.filter((p, i) => !p.startsWith(HEADING_PREFIX) || (out[i + 1] && !out[i + 1].startsWith(HEADING_PREFIX))).join("\n\n");
}

/** Plain-text books (Gutenberg, bokselskap .txt): unify line breaks, drop illustration notes, mark chapter titles. */
export function textToBody(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\[(Illustration|Illustrasjon|Picture)[^\]]*\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((p) => (isChapterTitle(p) ? HEADING_PREFIX + p.replace(/\.$/, "") : p))
    .join("\n\n");
}

/** "CHAPTER IV.", "KAPITEL 3", "III.", or a short line in capitals: a chapter title. */
export function isChapterTitle(p: string): boolean {
  if (p.length > 70) return false;
  if (/^(chapter|kapitel|kapittel|del|part)\s+([0-9]+|[ivxlc]+)\b/i.test(p)) return true;
  if (/^[IVXLC]+\.?$/.test(p)) return true;
  return /\p{Lu}/u.test(p) && p === p.toUpperCase() && p.length >= 3 && !/[!?»"”]$/.test(p);
}
