import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { talkHelpPrompt, TalkHelpSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { loadConversation } from "@/lib/talk";

const Body = z.object({ conversationId: z.string().uuid(), wish: z.string().max(300).optional() });

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const loaded = await loadConversation(s, b.conversationId);
  if (!loaded) return NextResponse.json({ error: "Разговор не найден." }, { status: 404 });
  try {
    const res = await runTask({ task: "talk_help", userId: s.user.id, schema: TalkHelpSchema, maxTokens: 250, temperature: 0.4, lowLatency: true, prompt: talkHelpPrompt(loaded.ctx, loaded.history, b.wish) });
    logEvent(s, "talk.help", { conversationId: b.conversationId, withWish: !!b.wish, variant: res.variant });
    return NextResponse.json(res.data);
  } catch (e) {
    return aiFailure(e);
  }
}
