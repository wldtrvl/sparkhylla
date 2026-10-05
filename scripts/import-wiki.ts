/**
 * Norwegian Wikipedia articles about everyday Norway (CC BY-SA 4.0), as reading texts: the opening of each
 * article up to ~1200 words, cut at a section boundary (an excerpt of the original, never rewritten).
 * Paced for Wikimedia's limit of 10 requests a minute without IMPORT_CONTACT.
 *
 *   npm run import:wiki            # dry run
 *   npm run import:wiki -- --save
 */
import { draftFromUrl } from "@/lib/import/sources";
import { HEADING_PREFIX } from "@/lib/text-format";
import { insertText, newTexts, plural } from "./lib";

const TOPICS = [
  "17. mai", "Brunost", "Fårikål", "Lutefisk", "Vaffel", "Kanelbolle", "Matpakke", "Friluftsliv", "Allemannsretten", "Dugnad",
  "Janteloven", "Hytte", "Nordlys", "Midnattssol", "Fjord", "Vikingtiden", "Stavkirke", "Hurtigruten", "Bergensbanen", "Lofoten",
  "Preikestolen", "Geirangerfjorden", "Holmenkollbakken", "Langrenn", "Bunad", "Sankthansaften", "Påske i Norge", "Julebord",
  "Edvard Munch", "Henrik Ibsen", "Roald Amundsen", "Fridtjof Nansen", "Thor Heyerdahl", "Sonja Henie", "Kong Harald", "Stortinget",
  "Oslo", "Bergen", "Trondheim", "Tromsø", "Stavanger", "Svalbard", "Elg", "Reinsdyr", "Laks", "Torsk",
];
const MAX_WORDS = 1200;
const words = (s: string) => (s.match(/\p{L}+/gu) ?? []).length;

/** The opening of an article: whole sections until about MAX_WORDS. */
function excerpt(body: string): string {
  const out: string[] = [];
  let n = 0;
  for (const p of body.split("\n\n")) {
    if (p.startsWith(HEADING_PREFIX) && n >= MAX_WORDS * 0.6) break; // stop at a section boundary once long enough
    out.push(p);
    n += words(p);
    if (n >= MAX_WORDS && !p.startsWith(HEADING_PREFIX)) break;
  }
  while (out.length && out[out.length - 1].startsWith(HEADING_PREFIX)) out.pop();
  return out.join("\n\n");
}

async function main() {
  const save = process.argv.includes("--save");
  const now = new Date();
  const added = newTexts();
  let count = 0;
  for (const topic of TOPICS) {
    const url = `https://no.wikipedia.org/wiki/${encodeURIComponent(topic.replace(/ /g, "_"))}`;
    try {
      const d = await draftFromUrl(url, now);
      const body = excerpt(d.body);
      const n = words(body);
      if (n < 150) {
        console.log(`  skip ${topic}: only ${n} words`);
      } else {
        count++;
        console.log(`${save ? "save" : "would save"} | ${d.title} | ${n} words`);
        if (save) {
          const r = await insertText({
            lang: "no",
            title: d.title,
            author: d.author,
            year: d.year,
            kind: "article",
            author_note: "Начало статьи из норвежской Википедии: современный букмол о жизни в Норвегии.",
            body,
            source_url: d.sourceUrl,
            license: d.license,
            est_level: "B1",
          });
          added.add(r.status, d.title);
        }
      }
    } catch (e) {
      console.log(`  skip ${topic}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, process.env.IMPORT_CONTACT ? 800 : 7000));
  }
  await added.announce({ title: (n) => `${n} ${plural(n, ["новая статья", "новые статьи", "новых статей"])} о Норвегии`, author: (a) => `«${a}»`, link: "/library?kind=article" });
  console.log(`${count} articles ${save ? "imported" : "would be imported (dry run; add --save)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
