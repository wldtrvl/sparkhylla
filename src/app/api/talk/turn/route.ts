import { NextResponse } from "next/server";
import { aiFailure } from "@/lib/api";
import { tutorTurnPrompt, TutorTurnSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { sttAvailable, transcribe } from "@/lib/speech/stt";
import { synthesize } from "@/lib/speech/tts";
import { loadConversation } from "@/lib/talk";

/**
 * One learner turn. multipart form: conversationId, and either `audio` (+durationMs)
 * or `text` (typed, or recognised by the browser when no server STT is configured).
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const form = await req.formData();
  const id = String(form.get("conversationId") ?? "");
  const loaded = await loadConversation(s, id);
  if (!loaded) return NextResponse.json({ error: "Разговор не найден." }, { status: 404 });
  if (loaded.conv.ended_at) return NextResponse.json({ error: "Этот разговор уже завершён." }, { status: 409 });

  let learnerText = String(form.get("text") ?? "").trim();
  let sttProvider = "typed";
  const audio = form.get("audio");
  const durationSec = Math.max(0, Number(form.get("durationMs") ?? 0) / 1000);
  if (!learnerText && audio instanceof Blob && audio.size > 0) {
    if (!sttAvailable()) return NextResponse.json({ error: "Распознавание речи не настроено на сервере." }, { status: 503 });
    try {
      const t = await transcribe(audio, loaded.conv.lang, s.user.id, durationSec);
      learnerText = t.text;
      sttProvider = t.provider;
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "Не удалось распознать речь. Скажите ещё раз." }, { status: 502 });
    }
  } else if (learnerText) sttProvider = String(form.get("source") ?? "typed");
  if (!learnerText) return NextResponse.json({ error: "Я ничего не услышала. Скажите ещё раз, чуть громче." }, { status: 422 });

  await s.supabase.from("conversation_turns").insert({ conversation_id: id, user_id: s.user.id, role: "learner", text: learnerText, stt_provider: sttProvider });
  const history = [...loaded.history, { role: "learner" as const, text: learnerText }];
  try {
    const res = await runTask({ task: "tutor_turn", userId: s.user.id, schema: TutorTurnSchema, maxTokens: 700, temperature: 0.6, prompt: tutorTurnPrompt(loaded.ctx, history) });
    const validGoals = new Set(loaded.ctx.goals.map((g) => g.id));
    const goalsDone = Array.from(new Set([...loaded.conv.goals_done, ...res.data.goals_done.filter((g) => validGoals.has(g))]));
    await s.supabase.from("conversation_turns").insert({ conversation_id: id, user_id: s.user.id, role: "tutor", text: res.data.reply, notes: res.data.notes });
    await s.supabase.from("conversations").update({ goals_done: goalsDone }).eq("id", id);
    const audioUrl = await synthesize(res.data.reply, loaded.conv.lang, Number(s.profile.settings?.tts_rate ?? 0.9), s.user.id).catch(() => null);
    await logEvent(s, "talk.turn", {
      conversationId: id,
      words: learnerText.split(/\s+/).length,
      seconds: durationSec,
      stt: sttProvider,
      notes: res.data.notes.length,
      rules: res.data.notes.map((n) => n.rule_key),
      usedL1: res.data.learner_used_l1,
      goalsDone,
      variant: res.variant,
    });
    return NextResponse.json({ learnerText, reply: res.data.reply, audioUrl, goalsDone, noteCount: res.data.notes.length });
  } catch (e) {
    return aiFailure(e);
  }
}
