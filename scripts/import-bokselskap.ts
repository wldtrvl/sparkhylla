/**
 * Norwegian books from bokselskap.no (the Norwegian Academy's free library of classics), as EPUB.
 * Only authors who died more than 70 years ago (Norwegian copyright); modern editorial sections are left out.
 * Story collections become one library item per story; novels stay whole (a page break per chapter).
 * Nynorsk texts are skipped: the app reads Bokmål.
 *
 *   npm run import:bokselskap            # dry run: items, words, % known at B1
 *   npm run import:bokselskap -- --save  # adds new texts; existing ones are kept (see insertText)
 */
import { epubSections } from "@/lib/import/file";
import { publicDomainInNorway } from "@/lib/import/sources";
import { bandSize, coverage, frequencyBand } from "@/lib/learning/coverage";
import freqNo from "@/data/freq-no.json";
import { insertText } from "./lib";

const FREQ_NO = freqNo as string[];

type Kind = "novel" | "story" | "tale";
interface Book {
  slug: string;
  died: number;
  kind: Kind;
  level: string;
  split?: boolean; // a collection: one item per story
  only?: string[]; // keep only these stories (collections whose structure does not split cleanly)
  note: string;
}

const AANRUD = "Ханс Аанрюд (1863–1953): тёплые и смешные истории о детстве и деревенской жизни в долине Гудбрандсдал.";
const ZWILG = "Диккен Цвильгмейер (1853–1913): весёлые рассказы о детстве в маленьком норвежском городке, от лица девочки Ингер Юханне.";
const BRAATEN = "Оскар Бротен (1881–1939): рассказы о рабочих кварталах восточного Осло — с юмором и сочувствием.";
const NORMANN = "Регине Норманн (1867–1939): сказки и предания Северной Норвегии — тролли, море, северное сияние.";
const UNDSET = "Сигрид Унсет (1882–1949), лауреат Нобелевской премии: ранние рассказы о жизни в Кристиании (Осло).";
const BOO = "Сигрид Бу (1898–1953): лёгкие и смешные романы 1930-х, бестселлеры своего времени.";
const RIVERTON = "Стейн Ривертон (Свен Элвестад, 1884–1934): первый норвежский мастер детектива.";

const BOOKS: Book[] = [
  { slug: "sidselsidsaerk", died: 1953, kind: "novel", level: "B1", note: AANRUD },
  { slug: "solvesolfeng", died: 1953, kind: "novel", level: "B1", note: AANRUD },
  { slug: "viborn", died: 1913, kind: "story", level: "B1", split: true, note: ZWILG },
  { slug: "morsommedage", died: 1913, kind: "story", level: "B1", split: true, note: ZWILG },
  { slug: "sorgenfri", died: 1939, kind: "story", level: "B1", split: true, note: BRAATEN },
  { slug: "liljegunda", died: 1939, kind: "story", level: "B1", split: true, note: BRAATEN },
  { slug: "barnedaapen", died: 1939, kind: "novel", level: "B1", note: BRAATEN },
  { slug: "eventyr", died: 1939, kind: "tale", level: "B1", split: true, note: NORMANN },
  { slug: "nyeeventyr", died: 1939, kind: "tale", level: "B1", split: true, note: NORMANN },
  { slug: "fattigeskjaebner", died: 1949, kind: "story", level: "B2", split: true, only: ["Første møte", "Nikkedukken"], note: UNDSET },
  { slug: "denlykkeligealder", died: 1949, kind: "story", level: "B2", split: true, only: ["Drøm"], note: UNDSET },
  { slug: "kjokkenveien", died: 1953, kind: "novel", level: "B1", note: BOO },
  { slug: "fireibilen", died: 1953, kind: "novel", level: "B1", note: BOO },
  { slug: "heldigungdame", died: 1953, kind: "novel", level: "B1", note: BOO },
  { slug: "wrangel", died: 1934, kind: "novel", level: "B2", note: RIVERTON },
];

const UA = "Sprakhylla/0.1 (personal language-learning app)";
const words = (s: string) => (s.match(/\p{L}+/gu) ?? []).length;
const NYNORSK = /\b(ikkje|eg|kva|korleis|berre|noko|frå|heile|kvar|meir|då|dei|vore|gjekk)\b/gi;
const BOKMAL = /\b(ikke|jeg|hva|hvordan|bare|noe|fra|hele|hver|mer|da|de|vært|gikk|ikkun)\b/gi;
const isNynorsk = (t: string) => (t.match(NYNORSK)?.length ?? 0) > (t.match(BOKMAL)?.length ?? 0);
/** "I. Sidsel Sidsærk som spindekjærring" → "Sidsel Sidsærk som spindekjærring"; "ET HALVT DUSIN" → "Et halvt dusin" */
function cleanTitle(t: string): string {
  const x = t.replace(/^([IVXLC]+|\d+)\.\s+/, "").replace(/[.\s–-]+$/, "").replace(/\s+/g, " ").trim();
  return x === x.toUpperCase() ? x.charAt(0) + x.slice(1).toLowerCase() : x;
}
/** A chapter number like "I.", "[II]", "3": continues the current story instead of starting one. */
const isChapterNumber = (t: string | null) => !!t && /^\[?([IVXLC]+|\d+)\.?\]?$/.test(t.trim());

/**
 * Stories of a collection: a titled section starts a story (a short one is only the title page of the next
 * story), numbered or untitled sections continue it. Stories under 300 words are dropped.
 */
function stories(sections: { title: string | null; body: string }[], bookTitle: string) {
  const out: { title: string; parts: string[] }[] = [];
  for (const sec of sections) {
    const n = words(sec.body);
    if (sec.title && !isChapterNumber(sec.title) && cleanTitle(sec.title).toLowerCase() !== bookTitle.toLowerCase()) {
      const rest = sec.body.split("\n\n").slice(1).join("\n\n");
      out.push({ title: cleanTitle(sec.title), parts: n >= 120 && rest ? [rest] : [] });
    } else if (out.length && n >= 60) out[out.length - 1].parts.push(sec.body);
  }
  return out.map((x) => ({ title: x.title, body: x.parts.join("\n\n") })).filter((x) => words(x.body) >= 300);
}

async function main() {
  const save = process.argv.includes("--save");
  const now = new Date();
  const band = { band: frequencyBand("no", "B1"), own: new Set<string>() };
  let count = 0;
  for (const b of BOOKS) {
    if (!publicDomainInNorway(b.died, now)) {
      console.log(`SKIP ${b.slug}: author died ${b.died}, still protected in Norway`);
      continue;
    }
    const url = `https://www.bokselskap.no/wp-content/themes/bokselskap2/tekster/epub/${b.slug}.epub`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) {
      console.log(`SKIP ${b.slug}: HTTP ${res.status}`);
      continue;
    }
    const book = epubSections(new Uint8Array(await res.arrayBuffer()), { minSectionWords: b.split ? 0 : 120 });
    const all = book.sections.filter((x) => words(x.body) >= 120).map((x) => x.body).join("\n\n");
    if (isNynorsk(all)) {
      console.log(`SKIP ${b.slug} «${book.meta.title}»: nynorsk`);
      continue;
    }
    const items = b.split ? stories(book.sections, book.meta.title.trim()).filter((x) => !b.only || b.only.includes(x.title)) : [{ title: book.meta.title.replace(/\s+/g, " ").trim(), body: all }];
    for (const it of items) {
      count++;
      const cov = coverage(it.body, band, "no").coverage;
      if (process.env.BANDS) {
        const alt = process.env.BANDS.split(",").map((n) => `${n}:${Math.round(coverage(it.body, { band: new Set(FREQ_NO.slice(0, Number(n))), own: new Set() }, "no").coverage * 100)}%`);
        console.log("    bands", alt.join(" "));
      }
      console.log(
        `${save ? "save" : "would save"} ${b.slug} | ${it.title} | ${book.meta.creator} | ${words(it.body)} words | ${Math.round(cov * 100)}% at B1 (band ${bandSize("B1")})`,
      );
      if (!save) continue;
      const r = await insertText({
        lang: "no",
        title: it.title,
        author: book.meta.creator,
        year: "",
        kind: b.kind,
        author_note: b.split ? `${b.note} Из сборника «${book.meta.title}».` : b.note,
        body: it.body,
        source_url: `https://www.bokselskap.no/boker/${b.slug}/titlepage`,
        license: `public domain (author d. ${b.died}; bokselskap.no edition)`,
        est_level: b.level,
      });
      if (r.status === "kept") console.log("    already in the library: kept as is");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`${count} texts ${save ? "processed" : "would be imported (dry run; add --save)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
