import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { explainPrompt } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { GRAMMAR } from "@/lib/learning/grammar";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ key: z.string().max(60) });

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const topic = GRAMMAR.find((g) => g.key === b.key);
  if (!topic) return NextResponse.json({ error: "Тема не найдена." }, { status: 404 });
  try {
    const res = await runTask({
      task: "explain",
      userId: s.user.id,
      maxTokens: 1500,
      temperature: 0.4,
      prompt: explainPrompt({ lang: topic.lang, uiLang: s.profile.ui_lang, level: s.profile.levels[topic.lang]?.reading ?? topic.level, title: topic.title, body: topic.body }),
    });
    logEvent(s, "grammar.explain", { key: b.key, variant: res.variant });
    return NextResponse.json({ text: res.data });
  } catch (e) {
    return aiFailure(e);
  }
}
