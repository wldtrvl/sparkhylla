import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/env";
import { buildVocab, type Lang } from "@/lib/learning/coverage";

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

/** Store a text's vocabulary (text_vocab + counts on texts) so the library can compute coverage in SQL. */
export async function writeVocab(db: SupabaseClient, textId: string, body: string, lang: Lang) {
  const v = buildVocab(body, lang);
  const del = await db.from("text_vocab").delete().eq("text_id", textId);
  if (del.error) throw new Error(`text_vocab: ${del.error.message} (run migration 0003_text_vocab.sql first)`);
  const rows = v.entries.map((e) => ({ text_id: textId, ...e }));
  for (let i = 0; i < rows.length; i += 1000) {
    const ins = await db.from("text_vocab").insert(rows.slice(i, i + 1000));
    if (ins.error) throw ins.error;
  }
  const upd = await db.from("texts").update({ token_count: v.tokens, proper_tokens: v.proper, vocab_built_at: new Date().toISOString() }).eq("id", textId);
  if (upd.error) throw upd.error;
  return { forms: rows.length, tokens: v.tokens };
}
