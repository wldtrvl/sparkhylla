import "server-only";
import type { ScenarioCtx } from "@/lib/ai/prompts";
import type { Session } from "@/lib/session";

export interface ConversationRow {
  id: string;
  user_id: string;
  scenario_id: string;
  lang: "no" | "en";
  level: string;
  goals_done: string[];
  ended_at: string | null;
}

export async function loadConversation(s: Session, id: string) {
  const { data: conv } = await s.supabase.from("conversations").select("*").eq("id", id).eq("user_id", s.user.id).maybeSingle();
  if (!conv) return null;
  const { data: sc } = await s.supabase.from("scenarios").select("*").eq("id", conv.scenario_id).single();
  const { data: turns } = await s.supabase.from("conversation_turns").select("role,text,notes,created_at").eq("conversation_id", id).order("id");
  const ctx: ScenarioCtx = {
    persona: sc.persona,
    setting: sc.setting,
    goals: sc.goals,
    lang: conv.lang,
    level: conv.level,
    uiLang: s.profile.ui_lang,
  };
  const history = (turns ?? []).map((t) => ({ role: t.role as "tutor" | "learner", text: t.text as string }));
  const notes = (turns ?? []).flatMap((t) => (Array.isArray(t.notes) ? t.notes : []));
  return { conv: conv as ConversationRow, scenario: sc, ctx, history, notes };
}
