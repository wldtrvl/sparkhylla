/**
 * Import a curated shelf of public-domain books from Project Gutenberg, splitting story collections into
 * one library item per story. Uses the same fetching and rights rules as the coach import screen
 * (Norway: author and translator died 70+ years ago).
 *
 *   npm run import:batch            # dry run: lists what would be imported
 *   npm run import:batch -- --save  # adds new texts; existing ones are kept (see insertText)
 *   npm run import:batch -- --only=269,3688  # just these books
 *
 * Runs with --conditions=react-server so the server modules can be reused outside Next.
 */
import { draftFromUrl } from "@/lib/import/sources";
import { isHeading, paragraphText } from "@/lib/text-format";
import { insertText } from "./lib";

type Kind = "novel" | "story" | "tale" | "fable" | "article" | "other";
interface Book {
  id: number;
  kind: Kind;
  level: string;
  year: string;
  note: string; // about the author, in Russian
  /** split a collection into stories: at headings matching a pattern, at exact title lines, or (true) at titles in capitals */
  split?: RegExp | true | string[];
  /** sections that are not stories (a preface, a memoir) */
  skip?: string[];
  /** rights checked by hand when the catalogue does not say (e.g. translator) */
  confirmed?: string;
}

const POTTER = "Беатрикс Поттер (1866–1943), английская писательница и художница. Короткие истории о животных — классика детского чтения.";
const SAKI = "Саки (Гектор Хью Манро, 1870–1916), британский мастер короткого рассказа: остроумные истории с неожиданным и озорным финалом.";
const BOOKS: Book[] = [
  ...[14838, 14407, 14872, 14814, 14837, 14220, 14797, 14877, 14848, 45265, 45264, 15284, 15077, 15137, 17089, 15575, 15234, 19805, 14868].map(
    (id): Book => ({ id, kind: "story", level: "A2", year: "1902–1912", note: POTTER }),
  ),
  { id: 11757, kind: "story", level: "A2", year: "1922", note: "Марджери Уильямс (1881–1944). Сказка о плюшевом кролике, который мечтал стать настоящим." },
  { id: 19994, kind: "fable", level: "A2", year: "1919", confirmed: "Aesop (ancient); anonymous 1919 edition", note: "Басни Эзопа в издании для детей 1919 года: короткие истории с моралью." },
  { id: 902, kind: "tale", level: "B1", year: "1888", split: ["The Happy Prince", "The Nightingale and the Rose", "The Selfish Giant", "The Devoted Friend", "The Remarkable Rocket"], note: "Оскар Уайльд (1854–1900), ирландский писатель. Сказки для детей и взрослых — о доброте и жертвенности." },
  { id: 2591, kind: "tale", level: "B1", year: "1812–1857", split: true, confirmed: "translators Edgar Taylor (d. 1839) and Marian Edwardes (d. 1930s)", note: "Братья Гримм, немецкие собиратели сказок. Перевод на английский XIX века." },
  { id: 2781, kind: "story", level: "B1", year: "1902", split: true, note: "Редьярд Киплинг (1865–1936). «Просто сказки» — забавные истории о том, откуда что взялось у животных." },
  { id: 2776, kind: "story", level: "B2", year: "1906", split: true, note: "О. Генри (1862–1910), американский мастер короткого рассказа с неожиданным концом." },
  { id: 1661, kind: "story", level: "B2", year: "1892", split: /^[IVX]+\. [A-Z]/, note: "Артур Конан Дойл (1859–1930). Рассказы о Шерлоке Холмсе." },
  { id: 13415, kind: "story", level: "B2", year: "1899", split: ["## THE LADY WITH THE DOG", "## A DOCTOR'S VISIT", "## AN UPHEAVAL", "## IONITCH", "## THE HEAD OF THE FAMILY", "## THE BLACK MONK", "## VOLODYA", "## AN ANONYMOUS STORY", "## THE HUSBAND"].map((t) => t.slice(3)), note: "Антон Чехов (1860–1904) в переводе Констанс Гарнетт (1861–1946)." },
  { id: 710, kind: "story", level: "B2", year: "1907", split: true, note: "Джек Лондон (1876–1916), американский писатель: рассказы о Севере и выживании." },
  { id: 269, kind: "story", level: "B2", year: "1914", split: true, note: SAKI },
  { id: 3688, kind: "story", level: "B2", year: "1911", split: true, note: SAKI },
  { id: 1477, kind: "story", level: "B2", year: "1919", split: true, skip: ["Hector Hugh Munro"], note: SAKI },
  { id: 11870, kind: "story", level: "B2", year: "1911", split: true, skip: ["H. G. Wells", "A Pantoum in Prose", "A Dream of Armageddon"], note: "Герберт Уэллс (1866–1946), английский писатель, один из отцов научной фантастики: странные и удивительные истории." },
];

const SMALL = new Set(["a", "an", "the", "of", "and", "in", "on", "to", "with", "for", "at", "by", "or", "as", "from", "who", "his", "her"]);
/** "THE HAPPY PRINCE" → "The Happy Prince"; leaves mixed-case titles alone. */
function titleCase(s: string): string {
  const t = s.replace(/^([IVX]+|\d+)\.\s+/, "").replace(/[.:]+$/, "").trim();
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^(\W*)(\p{L})/u, (_, p, c) => p + c.toUpperCase())))
    .join(" ");
}

const words = (s: string) => (s.match(/\p{L}+/gu) ?? []).length;
const norm = (s: string) => s.replace(/[.\s]+$/, "").toLowerCase();
function isStoryTitle(p: string, rule: RegExp | true | string[]): boolean {
  if (Array.isArray(rule)) return rule.some((t) => norm(paragraphText(p)) === norm(t));
  if (!isHeading(p)) return false;
  const t = paragraphText(p);
  return rule === true ? !/^(chapter|part|book)?\s*[IVXLC0-9]+\.?$/i.test(t) && !/^(contents|preface|introduction|the end)\b/i.test(t) : rule.test(t);
}

/** Drop the title page and "THE END": start at the first paragraph that reads like text. */
function trimFrontMatter(paras: string[]): string[] {
  const first = paras.findIndex((p) => !isHeading(p) && words(p) >= 8);
  const out = paras.slice(Math.max(0, first)).filter((p) => !/^##\s*THE END\.?$/i.test(p));
  return out;
}

function stories(body: string, rule: RegExp | true | string[]): { title: string; body: string }[] {
  const paras = body.split("\n\n");
  const out: { title: string; paras: string[] }[] = [];
  for (const p of paras) {
    if (isStoryTitle(p, rule)) out.push({ title: titleCase(paragraphText(p)), paras: [] });
    else if (out.length) out[out.length - 1].paras.push(p);
  }
  return out
    .map((s) => ({ title: s.title, body: trimFrontMatter(s.paras).join("\n\n") }))
    .filter((s) => words(s.body) >= 300);
}

async function main() {
  const save = process.argv.includes("--save");
  const now = new Date();
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
  let count = 0;
  for (const b of BOOKS.filter((x) => !only || only.includes(x.id))) {
    const d = await draftFromUrl(`https://www.gutenberg.org/ebooks/${b.id}`, now);
    const ok = d.rights === "ok" || (d.rights === "check" && !!b.confirmed);
    const license = `public domain (Project Gutenberg #${b.id}${b.confirmed ? `; ${b.confirmed}` : ""})`;
    if (!ok) {
      console.log(`SKIP #${b.id} ${d.title}: ${d.rights} — ${d.notes.join(" ")}`);
      continue;
    }
    const items = b.split
      ? stories(d.body, b.split).filter((s) => !b.skip?.includes(s.title)).map((s) => ({ title: s.title, body: s.body, collection: d.title }))
      : [{ title: d.title.replace(/\s+/g, " "), body: trimFrontMatter(d.body.split("\n\n")).join("\n\n"), collection: null as string | null }];
    for (const it of items) {
      count++;
      console.log(`${save ? "save" : "would save"} #${b.id} ${b.kind} ${b.level} | ${it.title} | ${d.author} | ${words(it.body)} words${it.collection ? ` | from «${it.collection}»` : ""}`);
      if (save)
        await insertText({
          lang: d.lang,
          title: it.title,
          author: d.author,
          year: b.year,
          kind: b.kind,
          author_note: it.collection ? `${b.note} Из сборника «${it.collection}».` : b.note,
          body: it.body,
          source_url: d.sourceUrl,
          license,
          est_level: b.level,
        });
    }
    await new Promise((r) => setTimeout(r, 500)); // polite to gutenberg.org
  }
  console.log(`${count} texts ${save ? "processed (new ones added, existing kept)" : "would be imported (dry run; add --save)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
