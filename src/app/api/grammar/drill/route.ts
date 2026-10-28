import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFailure, parseBody } from "@/lib/api";
import { grammarDrillPrompt, GrammarDrillSchema } from "@/lib/ai/prompts";
import { runTask } from "@/lib/ai/run";
import { GRAMMAR } from "@/lib/learning/grammar";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ key: z.string().max(60) });

/**
 * Practice for one rule: first her own sentences from conversations where she broke it (fix the mistake),
 * then fresh exercises. Every item carries its answer, and the page checks it.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const rule = GRAMMAR.find((g) => g.key === b.key);
  if (!rule) return NextResponse.json({ error: "Правило не найдено." }, { status: 404 });
  const { data: mine } = await s.supabase.from("feedback_items").select("said,correction").eq("user_id", s.user.id).eq("rule_key", rule.key).order("created_at", { ascending: false }).limit(6);
  const seen = new Set<string>();
  const personal = (mine ?? [])
    .filter((f) => f.said && f.correction && f.said.trim() !== f.correction.trim() && !seen.has(f.said) && seen.add(f.said))
    .slice(0, 3)
    .map((f) => ({ type: "fix" as const, wrong: f.said, right: f.correction, ru: "Ваша фраза из разговора", personal: true }));
  try {
    const level = s.profile.levels[rule.lang]?.speaking ?? "B1";
    const res = await runTask({
      task: "grammar_drill",
      userId: s.user.id,
      schema: GrammarDrillSchema,
      maxTokens: 1800,
      temperature: 0.6,
      lowLatency: true,
      prompt: grammarDrillPrompt({ lang: rule.lang, uiLang: s.profile.ui_lang, level, title: rule.title, body: rule.body, pattern: rule.pattern, examples: rule.examples }),
    });
    // a choice whose answer is not among its options cannot be checked: drop it
    const items = res.data.items.filter((x) => x.type !== "choose" || x.options.includes(x.answer));
    logEvent(s, "grammar.drill", { key: rule.key, items: items.length, personal: personal.length, variant: res.variant });
    return NextResponse.json({ items: [...personal, ...items] });
  } catch (e) {
    if (personal.length) return NextResponse.json({ items: personal });
    return aiFailure(e);
  }
}
