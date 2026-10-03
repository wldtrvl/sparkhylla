/**
 * All prompts in one place, versioned. Changing wording? Bump `version` so llm_calls can
 * compare before/after. Output schemas live next to the prompts that promise them.
 */
import { z } from "zod";
import { RULE_KEYS } from "@/lib/learning/grammar";
import type { ChatMessage, PromptSpec } from "./types";

export type Lang = "no" | "en";
export type UiLang = "ru" | "uk";

const langName = (l: Lang) => (l === "no" ? "Norwegian Bokmål" : "English");
const uiName = (u: UiLang) => (u === "uk" ? "Ukrainian" : "Russian");

const LEARNER = (lang: Lang, uiLang: UiLang, level: string) =>
  `The learner is a 51-year-old woman, native speaker of Ukrainian and Russian, living in Norway. ` +
  `She is learning ${langName(lang)} at CEFR level ${level}` +
  (lang === "en" ? ", and already speaks Norwegian at about B1 — Norwegian comparisons help her." : ".") +
  ` Explanations for her are written in ${uiName(uiLang)}.`;

// ---------- gloss ----------
export const GlossSchema = z.object({
  lemma: z.string(),
  translation: z.string(),
  pos: z.string().optional().default(""),
  forms: z.string().optional().default(""),
  note: z.string().nullable().optional().default(null),
  norwegian: z.string().nullable().optional().default(null),
  is_phrase: z.boolean().optional().default(false),
});
export type Gloss = z.infer<typeof GlossSchema>;

export function glossPrompt(p: { lang: Lang; uiLang: UiLang; level: string; term: string; sentence: string }): PromptSpec {
  return {
    id: "gloss",
    version: 1,
    system:
      `You are a precise bilingual dictionary for a language learner. ${LEARNER(p.lang, p.uiLang, p.level)}\n` +
      `Explain the meaning of the given ${langName(p.lang)} word or phrase AS USED IN THE SENTENCE. Be accurate; if a word is part of a fixed expression in the sentence, say so in the note.\n` +
      `Reply with ONLY a JSON object:\n` +
      `{"lemma": dictionary form (Norwegian: infinitive with "å" for verbs, noun with article e.g. "en bil"), ` +
      `"translation": short ${uiName(p.uiLang)} translation for this context (1-4 words), ` +
      `"pos": part of speech in ${uiName(p.uiLang)}, ` +
      `"forms": main inflected forms (e.g. "å hogge – hogger – hogde – har hogd") or "", ` +
      `"note": one short ${uiName(p.uiLang)} usage or grammar note (max 25 words) or null, ` +
      `"norwegian": ${p.lang === "en" ? "the Norwegian equivalent" : "null"}, ` +
      `"is_phrase": true if a multi-word expression}`,
    messages: [{ role: "user", content: `Word or phrase: "${p.term}"\nSentence: "${p.sentence}"` }],
  };
}

// ---------- conversation ----------
export interface ScenarioCtx {
  persona: string;
  setting: string;
  goals: { id: string; ru: string }[];
  lang: Lang;
  level: string;
  uiLang: UiLang;
}

function tutorSystem(s: ScenarioCtx) {
  return (
    `You play a role in a spoken ${langName(s.lang)} role-play for language practice. ${LEARNER(s.lang, s.uiLang, s.level)}\n` +
    `Your role: ${s.persona}.\nSituation: ${s.setting}\n` +
    `Learner's goals (ids): ${s.goals.map((g) => `${g.id} = ${g.ru}`).join("; ")}.\n` +
    `Rules:\n` +
    `- Stay in character. Speak ONLY ${langName(s.lang)}, natural but at level ${s.level}: short sentences, common words. 1–3 sentences per turn.\n` +
    `- Your text will be read aloud by text-to-speech: no emojis, no lists, no stage directions.\n` +
    `- NEVER correct the learner during the conversation. Keep the conversation flowing; if her meaning is clear, just answer.\n` +
    `- If her sentence is hard to understand, ask a simple clarifying question, as a real person would.\n` +
    `- If she uses Russian or Ukrainian, say the ${langName(s.lang)} version naturally inside your reply (e.g. "Du mener: …?") so she can repeat it.\n` +
    `- Gently steer the situation so she can reach her goals; do not reach them for her.`
  );
}

export const TalkOpenSchema = z.object({ reply: z.string().min(1) });

export function talkOpenPrompt(s: ScenarioCtx): PromptSpec {
  return {
    id: "talk_open",
    version: 1,
    system: tutorSystem(s),
    messages: [{ role: "user", content: `Start the conversation with your first line, in character. Reply with ONLY JSON: {"reply": "..."}` }],
  };
}

export const TutorTurnSchema = z.object({
  reply: z.string().min(1),
  goals_done: z.array(z.string()).default([]),
  notes: z
    .array(
      z.object({
        said: z.string(),
        issue: z.string(),
        correction: z.string(),
        rule_key: z.string().default("other"),
      }),
    )
    .default([]),
  learner_used_l1: z.boolean().default(false),
});
export type TutorTurn = z.infer<typeof TutorTurnSchema>;

/** history: alternating tutor/learner lines, tutor first. */
export function tutorTurnPrompt(s: ScenarioCtx, history: { role: "tutor" | "learner"; text: string }[]): PromptSpec {
  const transcript = history.map((h) => `${h.role === "tutor" ? "YOU" : "LEARNER"}: ${h.text}`).join("\n");
  const messages: ChatMessage[] = [
    {
      role: "user",
      content:
        `Conversation so far (learner's lines come from speech recognition and may contain recognition errors — ignore obvious ones):\n${transcript}\n\n` +
        `Reply in character to the learner's last line. Also, silently for the teacher, note real language mistakes in her LAST line only (max 2; ignore tiny slips and recognition noise).\n` +
        `rule_key must be one of: ${RULE_KEYS.join(", ")}.\n` +
        `Reply with ONLY JSON: {"reply": "...", "goals_done": [ids of goals she has now achieved in the whole conversation], ` +
        `"notes": [{"said": "her exact words", "issue": "short English description", "correction": "correct ${langName(s.lang)} version", "rule_key": "..."}], ` +
        `"learner_used_l1": true if she spoke Russian/Ukrainian}`,
    },
  ];
  return { id: "tutor_turn", version: 1, system: tutorSystem(s), messages };
}

export const TalkHelpSchema = z.object({ phrase: z.string(), translation: z.string() });

export function talkHelpPrompt(s: ScenarioCtx, history: { role: "tutor" | "learner"; text: string }[], wish?: string): PromptSpec {
  const transcript = history.map((h) => `${h.role === "tutor" ? "OTHER PERSON" : "LEARNER"}: ${h.text}`).join("\n");
  return {
    id: "talk_help",
    version: 1,
    system: `You help a language learner find what to say next in a role-play. ${LEARNER(s.lang, s.uiLang, s.level)} Situation: ${s.setting}`,
    messages: [
      {
        role: "user",
        content:
          `Conversation:\n${transcript}\n\n` +
          (wish ? `She wants to say (in her own language): "${wish}"\n` : "") +
          `Suggest ONE short, natural sentence she could say next at level ${s.level}, moving toward her goals. ` +
          `Reply with ONLY JSON: {"phrase": "${langName(s.lang)} sentence", "translation": "${uiName(s.uiLang)} translation"}`,
      },
    ],
  };
}

export const FeedbackSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()).max(4).default([]),
  fixes: z
    .array(
      z.object({
        said: z.string(),
        hint: z.string(),
        correction: z.string(),
        rule_key: z.string().default("other"),
      }),
    )
    .max(3)
    .default([]),
  new_phrases: z.array(z.object({ term: z.string(), translation: z.string() })).max(6).default([]),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export function feedbackPrompt(
  s: ScenarioCtx,
  history: { role: "tutor" | "learner"; text: string }[],
  notes: { said: string; issue: string; correction: string; rule_key: string }[],
  pastRuleCounts: Record<string, number>,
): PromptSpec {
  const transcript = history.map((h) => `${h.role === "tutor" ? "TUTOR" : "LEARNER"}: ${h.text}`).join("\n");
  return {
    id: "talk_feedback",
    version: 1,
    system:
      `You are a warm, precise language teacher writing short feedback after a spoken role-play. ${LEARNER(s.lang, s.uiLang, s.level)}\n` +
      `Teaching rules: praise specifically; choose at most 2 fixes — the ones that matter most for being understood or that recur; ` +
      `for each fix write a HINT that helps her find the correction herself (do not reveal the answer in the hint); ` +
      `write everything for her in ${uiName(s.uiLang)}, except "said", "correction" and phrases, which are in ${langName(s.lang)}.`,
    messages: [
      {
        role: "user",
        content:
          `Goals: ${s.goals.map((g) => `${g.id} = ${g.ru}`).join("; ")}\nTranscript:\n${transcript}\n\n` +
          `Notes taken during the conversation:\n${JSON.stringify(notes)}\n` +
          `How often each rule came up in her earlier conversations: ${JSON.stringify(pastRuleCounts)}\n` +
          `rule_key must be one of: ${RULE_KEYS.join(", ")}.\n` +
          `Reply with ONLY JSON: {"summary": "1–2 warm specific sentences", "wins": ["..."], ` +
          `"fixes": [{"said": "...", "hint": "...", "correction": "...", "rule_key": "..."}], ` +
          `"new_phrases": [{"term": "useful ${langName(s.lang)} phrase from this conversation", "translation": "..."}]}`,
      },
    ],
  };
}

// ---------- grammar explanation ----------
export function explainPrompt(p: { lang: Lang; uiLang: UiLang; level: string; title: string; body: string }): PromptSpec {
  return {
    id: "explain",
    version: 1,
    system: `You are a patient ${langName(p.lang)} teacher. ${LEARNER(p.lang, p.uiLang, p.level)}`,
    messages: [
      {
        role: "user",
        content:
          `Topic: ${p.title}. Short rule: ${p.body}\n` +
          `Write in ${uiName(p.uiLang)}, plain text without Markdown symbols: a simple explanation in 3–4 sentences; ` +
          `4 everyday example sentences in ${langName(p.lang)} with translation; then an exercise of 5 short gap-fill sentences numbered 1–5; ` +
          `then, after a blank line, the answers under the heading "Ответы:" (or "Відповіді:" in Ukrainian).`,
      },
    ],
  };
}

// ---------- evaluation judge ----------
export const JudgeSchema = z.object({ score: z.number().min(1).max(5), reason: z.string() });

export function judgePrompt(p: { task: string; rubric: string; input: string; output: string }): PromptSpec {
  return {
    id: "judge",
    version: 1,
    system: "You are a strict evaluator of AI outputs for a language-learning app. Score honestly; do not reward length.",
    messages: [
      {
        role: "user",
        content: `Task: ${p.task}\nRubric: ${p.rubric}\nInput:\n${p.input}\n\nOutput to evaluate:\n${p.output}\n\nReply with ONLY JSON: {"score": 1-5, "reason": "one sentence"}`,
      },
    ],
  };
}
