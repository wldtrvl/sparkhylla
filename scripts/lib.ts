import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/env";
import { writeVocab } from "@/lib/vocab";

export { writeVocab };

export function admin() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Normalise a plain-text book: unify line endings, keep paragraphs (blank-line separated). */
export function cleanBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\[Illustration[^\]]*\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const wordCount = (s: string) => (s.match(/[\p{L}]+/gu) ?? []).length;

/**
 * Add a text to the library. A text with the same title and author is left untouched (her reading position,
 * page numbers and saved words point into it) unless the script runs with --update; even then, a text someone
 * is reading is only changed with --force.
 */
export async function insertText(t: {
  lang: "no" | "en";
  title: string;
  author: string;
  year?: string;
  kind?: string;
  author_note?: string;
  body: string;
  source_url: string;
  license: string;
  est_level?: string;
}): Promise<{ id: string; status: "created" | "updated" | "kept" }> {
  const db = admin();
  const { data: existing } = await db.from("texts").select("id").eq("title", t.title).eq("author", t.author).maybeSingle();
  if (existing) {
    if (!process.argv.includes("--update")) return { id: existing.id as string, status: "kept" };
    const { count } = await db.from("reading_progress").select("user_id", { count: "exact", head: true }).eq("text_id", existing.id);
    if (count && !process.argv.includes("--force")) {
      console.log(`  kept «${t.title}»: ${count} reader(s) have progress in it (use --force to change it anyway)`);
      return { id: existing.id as string, status: "kept" };
    }
  }
  const row = { ...t, availability: "in_app", word_count: wordCount(t.body), kind: t.kind ?? "story" };
  const res = existing ? await db.from("texts").update(row).eq("id", existing.id).select("id").single() : await db.from("texts").insert(row).select("id").single();
  if (res.error) throw res.error;
  const id = res.data.id as string;
  await writeVocab(db, id, t.body, t.lang);
  return { id, status: existing ? "updated" : "created" };
}

/**
 * «Что нового» for an import run: collects the texts it added and posts one entry at the end
 * (nothing when the run only kept existing texts, or with --quiet).
 */
export function newTexts() {
  const byAuthor = new Map<string, number>();
  return {
    add(status: "created" | "updated" | "kept", author: string) {
      if (status === "created") byAuthor.set(author, (byAuthor.get(author) ?? 0) + 1);
    },
    async announce(o: { title: (n: number) => string; author: (name: string) => string; link?: string }) {
      const n = [...byAuthor.values()].reduce((a, b) => a + b, 0);
      if (!n || process.argv.includes("--quiet")) return;
      const authors = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => o.author(name));
      const body = `${authors.slice(0, 8).join(", ")}${authors.length > 8 ? " и другие" : ""}.`;
      const { error } = await admin().from("app_updates").insert({ kind: "content", title: o.title(n), body, link: o.link ?? "/library" });
      console.log(error ? `«Что нового» not posted: ${error.message}` : `«Что нового»: ${o.title(n)}`);
    },
  };
}

/** Russian plural: plural(5, ["текст", "текста", "текстов"]) → "текстов". */
export function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10, m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
}
