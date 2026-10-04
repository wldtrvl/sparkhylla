import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { translatePrompt, translateSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { adminClient } from "@/lib/supabase/admin";
import { apiSession, isResponse, logEvent } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({
  lang: z.enum(["no", "en"]),
  textId: z.string().uuid().optional(),
  sentences: z.array(z.string().trim().min(1).max(800)).min(1).max(150),
});

const CHUNK = 40; // sentences per AI call: keeps answers short and well-formed

/**
 * Sentence-by-sentence translation of a page («Перевод рядом»). Sentences of texts stored in the app are
 * cached; pasted pages (companion mode, copyrighted books) are translated but never stored.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const ui = s.profile.ui_lang;
  const version = translatePrompt({ lang: b.lang, uiLang: ui, sentences: [] }).version;
  const keyOf = (sentence: string) => createHash("sha1").update(`${b.lang}|${ui}|${version}|${sentence}`).digest("hex");
  const keys = b.sentences.map(keyOf);

  let cacheable = false;
  if (b.textId) {
    const { data: t } = await s.supabase.from("texts").select("availability").eq("id", b.textId).maybeSingle();
    cacheable = t?.availability === "in_app";
  }
  const found = new Map<string, string>();
  if (cacheable) {
    const { data } = await s.supabase.from("translation_cache").select("key,translation").in("key", keys);
    for (const r of data ?? []) found.set(r.key, r.translation);
  }

  const missing = [...new Set(b.sentences.filter((_, i) => !found.has(keys[i])))];
  const fresh: { key: string; sentence: string; translation: string }[] = [];
  let variant: string | null = null;
  try {
    for (let i = 0; i < missing.length; i += CHUNK) {
      const part = missing.slice(i, i + CHUNK);
      const res = await runTask({
        task: "translate",
        userId: s.user.id,
        schema: translateSchema(part.length),
        maxTokens: 120 + part.join(" ").length,
        temperature: 0.2,
        lowLatency: true,
        prompt: translatePrompt({ lang: b.lang, uiLang: ui, sentences: part }),
      });
      variant = res.variant;
      part.forEach((sentence, k) => {
        const key = keyOf(sentence);
        found.set(key, res.data.translations[k]);
        fresh.push({ key, sentence, translation: res.data.translations[k] });
      });
    }
  } catch (e) {
    return aiFailure(e);
  }

  if (cacheable && fresh.length)
    after(async () => {
      const { error } = await adminClient()
        .from("translation_cache")
        .upsert(fresh.map((f) => ({ ...f, lang: b.lang, ui_lang: ui, prompt_version: version })), { onConflict: "key" });
      if (error) console.error("translation_cache upsert failed:", error.message);
    });
  logEvent(s, "read.translate", { textId: b.textId ?? null, sentences: b.sentences.length, cached: b.sentences.length - missing.length, stored: cacheable, variant });
  return NextResponse.json({ translations: keys.map((k) => found.get(k) ?? "") });
}
