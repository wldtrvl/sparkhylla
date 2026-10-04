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
}) {
  const db = admin();
  const { data: existing } = await db.from("texts").select("id").eq("title", t.title).eq("author", t.author).maybeSingle();
  const row = { ...t, availability: "in_app", word_count: wordCount(t.body), kind: t.kind ?? "story" };
  const res = existing ? await db.from("texts").update(row).eq("id", existing.id).select("id").single() : await db.from("texts").insert(row).select("id").single();
  if (res.error) throw res.error;
  const id = res.data.id as string;
  await writeVocab(db, id, t.body, t.lang);
  return id;
}
