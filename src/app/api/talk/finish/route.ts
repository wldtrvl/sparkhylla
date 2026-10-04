import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { feedbackPrompt, FeedbackSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { ruleLabel } from "@/lib/learning/grammar";
import { newCard } from "@/lib/learning/srs";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { loadConversation } from "@/lib/talk";

const Body = z.object({ conversationId: z.string().uuid() });

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const loaded = await loadConversation(s, b.conversationId);
  if (!loaded) return NextResponse.json({ error: "Разговор не найден." }, { status: 404 });
  if (loaded.conv.ended_at) return NextResponse.json({ ok: true, alreadyFinished: true });
  if (!loaded.history.some((h) => h.role === "learner")) {
    await s.supabase.from("conversations").update({ ended_at: new Date().toISOString() }).eq("id", b.conversationId);
    return NextResponse.json({ ok: true, empty: true });
  }

  const { data: past } = await s.supabase.from("feedback_items").select("rule_key").eq("user_id", s.user.id).eq("lang", loaded.conv.lang).limit(500);
  const pastCounts: Record<string, number> = {};
  for (const r of past ?? []) if (r.rule_key) pastCounts[r.rule_key] = (pastCounts[r.rule_key] ?? 0) + 1;

  try {
    const res = await runTask({ task: "talk_feedback", userId: s.user.id, schema: FeedbackSchema, maxTokens: 1200, temperature: 0.3, prompt: feedbackPrompt(loaded.ctx, loaded.history, loaded.notes, pastCounts) });
    const fb = res.data;
    const fixes = fb.fixes.slice(0, 2);
    await s.supabase.from("conversations").update({ ended_at: new Date().toISOString(), summary: { ...fb, fixes } }).eq("id", b.conversationId);
    if (fixes.length) {
      await s.supabase.from("feedback_items").insert(
        fixes.map((f) => ({
          user_id: s.user.id,
          conversation_id: b.conversationId,
          lang: loaded.conv.lang,
          said: f.said,
          hint: f.hint,
          correction: f.correction,
          rule_key: f.rule_key,
          rule_label: ruleLabel(f.rule_key),
        })),
      );
    }
    // New phrases go straight into spaced review (skipping ones she already has).
    const now = new Date();
    for (const p of fb.new_phrases.slice(0, 5)) {
      const { data: exists } = await s.supabase.from("words").select("id").eq("user_id", s.user.id).eq("lang", loaded.conv.lang).ilike("term", p.term.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
      if (exists) continue;
      await s.supabase.from("words").insert({
        user_id: s.user.id, lang: loaded.conv.lang, term: p.term, translation: p.translation, kind: p.term.includes(" ") ? "phrase" : "word",
        status: "learning", source: `talk:${b.conversationId}`, fsrs: newCard(now), due: now.toISOString(),
      });
    }
    logEvent(s, "talk.finish", {
      conversationId: b.conversationId,
      turns: loaded.history.filter((h) => h.role === "learner").length,
      goalsDone: loaded.conv.goals_done,
      goalsTotal: loaded.ctx.goals.length,
      fixes: fixes.map((f) => f.rule_key),
      notesTotal: loaded.notes.length,
      variant: res.variant,
    });
    logEvent(s, "decision.feedback_selected", { conversationId: b.conversationId, chosen: fixes.map((f) => f.rule_key), candidates: loaded.notes.map((n: { rule_key?: string }) => n.rule_key ?? "other") });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiFailure(e);
  }
}
