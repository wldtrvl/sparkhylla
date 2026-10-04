/**
 * Import a public-domain or openly licensed text from a local UTF-8 .txt file
 * (e.g. downloaded from bokselskap.no or runeberg.org). Paragraphs = blank-line separated.
 *
 *   npm run import:text -- <file.txt> <lang> "<title>" "<author>" "<year>" "<source url>" "<license>" [kind] ["author note"]
 */
import { readFile } from "node:fs/promises";
import { cleanBody, insertText } from "./lib";

async function main() {
  const [file, lang, title, author, year, source, license, kind, note] = process.argv.slice(2);
  if (!file || !lang || !title || !author || !source || !license) {
    console.error('Usage: npm run import:text -- <file.txt> <no|en> "<title>" "<author>" "<year>" "<source url>" "<license>" [kind] ["author note"]');
    process.exit(1);
  }
  const body = cleanBody(await readFile(file, "utf8"));
  const { id, status } = await insertText({ lang: lang === "no" ? "no" : "en", title, author, year, kind, author_note: note, body, source_url: source, license });
  console.log(`${status === "kept" ? "Already in the library (use --update to replace)" : "Imported"}: "${title}" → texts.id = ${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
