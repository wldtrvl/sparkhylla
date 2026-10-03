import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { talkOpenPrompt, TalkOpenSchema, type ScenarioCtx } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { synthesize } from "@/lib/speech/tts";

const Body = z.object({ scenarioId: z.string().max(60) });

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const { data: sc } = await s.supabase.from("scenarios").select("*").eq("id", b.scenarioId).eq("active", true).maybeSingle();
  if (!sc) return NextResponse.json({ error: "Сценарий не найден." }, { status: 404 });
  const level = s.profile.levels[sc.lang as "no" | "en"]?.speaking ?? sc.level;
  const ctx: ScenarioCtx = { persona: sc.persona, setting: sc.setting, goals: sc.goals, lang: sc.lang, level, uiLang: s.profile.ui_lang };
  try {
    const res = await runTask({ task: "talk_open", userId: s.user.id, schema: TalkOpenSchema, maxTokens: 300, temperature: 0.7, lowLatency: true, prompt: talkOpenPrompt(ctx) });
    const { data: conv, error } = await s.supabase.from("conversations").insert({ user_id: s.user.id, scenario_id: sc.id, lang: sc.lang, level }).select("id").single();
    if (error) throw error;
    await s.supabase.from("conversation_turns").insert({ conversation_id: conv.id, user_id: s.user.id, role: "tutor", text: res.data.reply });
    const audioUrl = await synthesize(res.data.reply, sc.lang, Number(s.profile.settings?.tts_rate ?? 0.9), s.user.id).catch(() => null);
    await logEvent(s, "talk.start", { conversationId: conv.id, scenario: sc.id, level, variant: res.variant });
    return NextResponse.json({ conversationId: conv.id, reply: res.data.reply, audioUrl });
  } catch (e) {
    return aiFailure(e);
  }
}
