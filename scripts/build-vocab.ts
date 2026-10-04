/**
 * Build or rebuild the stored vocabulary of in-app texts (text_vocab), used by the library to compute
 * "% of words you know" in SQL. Run after migration 0003, after editing a body by hand, or after
 * changing the frequency lists.
 *
 *   npm run vocab:build            # texts whose vocabulary is missing (new or edited)
 *   npm run vocab:build -- --all   # every in-app text
 */
import { admin, writeVocab } from "./lib";

async function main() {
  const all = process.argv.includes("--all");
  const db = admin();
  let q = db.from("texts").select("id,lang,title").eq("availability", "in_app").not("body", "is", null);
  if (!all) q = q.is("token_count", null);
  const { data: texts, error } = await q;
  if (error) throw error;
  if (!texts?.length) return console.log(all ? "No in-app texts." : "All vocabularies are up to date. Use --all to rebuild everything.");
  for (const t of texts) {
    const { data } = await db.from("texts").select("body").eq("id", t.id).single();
    const r = await writeVocab(db, t.id, data!.body as string, t.lang);
    console.log(`${t.title}: ${r.tokens} words, ${r.forms} distinct forms`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
