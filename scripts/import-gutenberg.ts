/**
 * Import a public-domain book from Project Gutenberg into the library (stored in full, read in-app).
 *
 *   npm run import:gutenberg -- <id> <lang> "<title>" "<author>" [year] [kind] ["author note in Russian"]
 *   npm run import:gutenberg -- 14838 en "The Tale of Peter Rabbit" "Beatrix Potter" 1902 story "Английская писательница и художница (1866–1943)."
 *
 * Note: Gutenberg marks most books "public domain in the USA". Check the author's death year
 * for Norway/EU (life + 70 years) before importing.
 */
import { cleanBody, insertText, newTexts } from "./lib";

async function main() {
  const [id, lang, title, author, year, kind, note] = process.argv.slice(2);
  if (!id || !lang || !title || !author) {
    console.error('Usage: npm run import:gutenberg -- <id> <no|en> "<title>" "<author>" [year] [kind] ["author note"]');
    process.exit(1);
  }
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const raw = await res.text();
  const start = raw.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  const end = raw.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (start < 0 || end < 0) throw new Error("Could not find the Gutenberg START/END markers — check the id.");
  const bodyStart = raw.indexOf("\n", start) + 1;
  const body = cleanBody(raw.slice(bodyStart, end));
  const { id: textId, status } = await insertText({
    lang: lang === "no" ? "no" : "en",
    title,
    author,
    year,
    kind,
    author_note: note,
    body,
    source_url: `https://www.gutenberg.org/ebooks/${id}`,
    license: "public domain (Project Gutenberg)",
  });
  console.log(`${status === "kept" ? "Already in the library (use --update to replace)" : "Imported"}: "${title}" (${body.length} chars) → texts.id = ${textId}`);
  const added = newTexts();
  added.add(status, author);
  await added.announce({ title: () => `Новая книга: «${title}»`, author: (a) => a, link: `/read/${textId}` });
  console.log("Tip: open the text once and trim front matter (title page, table of contents) in Supabase if needed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
