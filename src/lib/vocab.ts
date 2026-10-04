/**
 * Store a text's vocabulary (text_vocab + counts on texts) so the library computes coverage in SQL.
 * Shared by the import scripts (service role) and the coach import screen (coach RLS).
 * No "server-only" here: the scripts run outside Next.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVocab, modernForm, tokenize, type Lang } from "@/lib/learning/coverage";

/** "old" when older riksmål spellings (sig, kunde, efter…) make up a noticeable share of the words. */
export function orthographyOf(body: string, lang: Lang): "modern" | "old" {
  if (lang !== "no") return "modern";
  const toks = tokenize(body);
  const old = toks.filter((t) => modernForm(t.norm, lang)).length;
  return toks.length && old / toks.length > 0.004 ? "old" : "modern";
}

export async function writeVocab(db: SupabaseClient, textId: string, body: string, lang: Lang) {
  const v = buildVocab(body, lang);
  const del = await db.from("text_vocab").delete().eq("text_id", textId);
  if (del.error) throw new Error(`text_vocab: ${del.error.message} (run migrations 0003 and 0006 first)`);
  const rows = v.entries.map((e) => ({ text_id: textId, ...e }));
  for (let i = 0; i < rows.length; i += 1000) {
    const ins = await db.from("text_vocab").insert(rows.slice(i, i + 1000));
    if (ins.error) throw ins.error;
  }
  const upd = await db
    .from("texts")
    .update({ token_count: v.tokens, proper_tokens: v.proper, vocab_built_at: new Date().toISOString(), orthography: orthographyOf(body, lang) })
    .eq("id", textId);
  if (upd.error) throw upd.error;
  return { forms: rows.length, tokens: v.tokens };
}
