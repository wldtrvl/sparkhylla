import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { glossPrompt, GlossSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { adminClient } from "@/lib/supabase/admin";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({
  lang: z.enum(["no", "en"]),
  term: z.string().min(1).max(80),
  sentence: z.string().max(600),
  textId: z.string().optional(),
});

/** Explain a word in context. Cached per (term, sentence) so the same tap never costs twice. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const body = await parseBody(req, Body);
  if (isResponse(body)) return body;
  const term = body.term.trim();
  const contextHash = createHash("sha1").update(body.sentence.trim()).digest("hex");
  const admin = adminClient();
  const cached = await admin
    .from("gloss_cache")
    .select("payload")
    .match({ lang: body.lang, ui_lang: s.profile.ui_lang, term: term.toLowerCase(), context_hash: contextHash })
    .maybeSingle();
  if (cached.data) {
    logEvent(s, "word.gloss", { term, cached: true, textId: body.textId });
    return NextResponse.json({ gloss: cached.data.payload, cached: true });
  }
  try {
    const res = await runTask({
      task: "gloss",
      userId: s.user.id,
      schema: GlossSchema,
      maxTokens: 400,
      temperature: 0.2,
      lowLatency: true,
      prompt: glossPrompt({ lang: body.lang, uiLang: s.profile.ui_lang, level: s.profile.levels[body.lang]?.reading ?? "B1", term, sentence: body.sentence }),
    });
    await admin.from("gloss_cache").upsert(
      { lang: body.lang, ui_lang: s.profile.ui_lang, term: term.toLowerCase(), context_hash: contextHash, payload: res.data },
      { onConflict: "lang,ui_lang,term,context_hash" },
    );
    logEvent(s, "word.gloss", { term, cached: false, variant: res.variant, textId: body.textId });
    return NextResponse.json({ gloss: res.data, cached: false });
  } catch (e) {
    return aiFailure(e);
  }
}
