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
  /** how the word is built: compound parts, prefixes, suffixes, endings ([] for simple words) */
  parts: z.array(z.object({ part: z.string(), meaning: z.string() })).optional().default([]),
  /** 2–3 short new sentences with the word at her level, one of them a question */
  examples: z.array(z.object({ text: z.string(), translation: z.string() })).max(4).optional().default([]),
});
export type Gloss = z.infer<typeof GlossSchema>;

export function glossPrompt(p: { lang: Lang; uiLang: UiLang; level: string; term: string; sentence: string }): PromptSpec {
  return {
    id: "gloss",
    version: 3,
    system:
      `You are a precise bilingual dictionary for a language learner. ${LEARNER(p.lang, p.uiLang, p.level)}\n` +
      `Explain the meaning of the given ${langName(p.lang)} word or phrase AS USED IN THE SENTENCE. Be accurate; if a word is part of a fixed expression in the sentence, say so in the note.\n` +
      (p.lang === "no"
        ? `The text may use older Norwegian spelling (riksmål before 1938, e.g. "sig", "kunde", "efter", "hvad", "blev"). If so, give the lemma in today's bokmål spelling and begin the note with the modern spelling of the word as written.\n`
        : "") +
      `Reply with ONLY a JSON object:\n` +
      `{"lemma": dictionary form (Norwegian: infinitive with "å" for verbs, noun with article e.g. "en bil"), ` +
      `"translation": short ${uiName(p.uiLang)} translation for this context (1-4 words), ` +
      `"pos": part of speech in ${uiName(p.uiLang)}, ` +
      `"forms": main inflected forms (e.g. "å hogge – hogger – hogde – har hogd") or "", ` +
      `"note": one short ${uiName(p.uiLang)} usage or grammar note (max 25 words) or null, ` +
      `"norwegian": ${p.lang === "en" ? "the Norwegian equivalent" : "null"}, ` +
      `"is_phrase": true if a multi-word expression, ` +
      `"parts": how the word is built, as [{"part": "...", "meaning": "${uiName(p.uiLang)} meaning or role"}] — the words of a compound (e.g. "fuglefengerhytta" → fugl/fugle, fenger, hytte), prefixes and suffixes (u-, -het, -lig), and an inflection ending (e.g. "-a" definite form); [] for a simple word or a phrase, ` +
      `"examples": 2 or 3 short, natural ${langName(p.lang)} sentences that use the word in the same meaning, at level ${p.level} or simpler — one of them a question — as [{"text": "...", "translation": "${uiName(p.uiLang)}"}]}`,
    messages: [{ role: "user", content: `Word or phrase: "${p.term}"\nSentence: "${p.sentence}"` }],
  };
}

// ---------- translate (reader: «Перевод рядом») ----------
/** Exactly one translation per sentence, in order: the reader lines them up row by row. */
export const translateSchema = (n: number) => z.object({ translations: z.array(z.string()).length(n) });

export function translatePrompt(p: { lang: Lang; uiLang: UiLang; sentences: string[] }): PromptSpec {
  return {
    id: "translate",
    version: 1,
    system:
      `You translate ${langName(p.lang)} literature and articles into natural ${uiName(p.uiLang)} for a learner who reads the original alongside. ` +
      `Translate each numbered sentence on its own, faithfully and completely: keep the meaning, tone and names, do not shorten, explain or add anything. ` +
      `Older spellings (e.g. Norwegian "sig", "kunde", "efter") are translated like their modern forms. A sentence that is only a title is translated as a title.\n` +
      `Reply with ONLY a JSON object: {"translations": [one ${uiName(p.uiLang)} string per sentence, in the same order]} with exactly ${p.sentences.length} items.`,
    messages: [{ role: "user", content: JSON.stringify(p.sentences.map((s, i) => ({ n: i + 1, text: s }))) }],
  };
}

// ---------- «Карта слов» (built offline: scripts/build-wordmap.ts) ----------
const POS_LIST = "verb, noun, adj, adv, pron, prep, conj, num, interj, other";

/** Frequency-list word forms → dictionary words. One item per form, in order. */
export const wordLemmaSchema = (n: number) =>
  z.object({
    items: z
      .array(
        z.object({
          form: z.string(),
          lemma: z.string(),
          display: z.string(),
          pos: z.string(),
          skip: z.boolean(),
        }),
      )
      .length(n),
  });

export function wordLemmaPrompt(p: { lang: Lang; forms: string[] }): PromptSpec {
  const no = p.lang === "no";
  return {
    id: "word_lemma",
    version: 1,
    system:
      `You are a careful ${langName(p.lang)} lexicographer. You get word forms from a frequency list of spoken ${langName(p.lang)} (film subtitles), most frequent first. ` +
      `For EACH form give its dictionary word in today's ${no ? "bokmål" : "standard English"}:\n` +
      `- "lemma": the base form in lower case, without article or infinitive marker (${no ? `"går", "gikk" → "gå"; "bilen" → "bil"; "pene" → "pen"` : `"went" → "go"; "children" → "child"; "better" → "good"`}).\n` +
      `- "display": the dictionary form a learner should see: ${no ? `verbs with "å" ("å gå"), nouns with their indefinite article ("en bil", "ei jente", "et hus"), other words as the lemma` : `the lemma itself ("go", "child", "good")`}.\n` +
      `- "pos": the most common part of speech of this form, one of: ${POS_LIST}.\n` +
      `- "skip": true for things that are not words to learn: personal names and place names that are not ordinary words, fragments of contractions ("'s", "t", "ll"), letters, filler sounds ("hmm", "ah", "eh"), and crude slang; false otherwise.\n` +
      `Reply with ONLY a JSON object {"items": [{"form", "lemma", "display", "pos", "skip"}]} with exactly ${p.forms.length} items, one per form, in the same order.`,
    messages: [{ role: "user", content: JSON.stringify(p.forms) }],
  };
}

/** Theme, translation and other ways to say it, for dictionary words. One item per word, in order. */
export const wordTagSchema = (n: number, themes: readonly string[]) =>
  z.object({
    items: z
      .array(
        z.object({
          lemma: z.string(),
          theme: z.enum(themes as [string, ...string[]]),
          translation: z.string(),
          analogues: z
            .array(z.object({ text: z.string(), level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]), note: z.string() }))
            .max(4),
        }),
      )
      .length(n),
  });

export function wordTagPrompt(p: { lang: Lang; uiLang: UiLang; words: { lemma: string; display: string; pos: string; level: string }[]; themes: Record<string, string> }): PromptSpec {
  return {
    id: "word_tag",
    version: 1,
    system:
      `You build a learner's map of the ${langName(p.lang)} vocabulary. ${LEARNER(p.lang, p.uiLang, "B1")}\n` +
      `For EACH word (with its part of speech and CEFR level) give:\n` +
      `- "theme": the one theme it belongs to most, by key: ${Object.entries(p.themes).map(([k, v]) => `${k} (${v})`).join(", ")}. Pronouns, articles, prepositions, conjunctions, auxiliary and modal verbs and other function words are "grammar"; general verbs of doing and moving (do, take, put, go, come, bring) are "actions".\n` +
      `- "translation": the main ${uiName(p.uiLang)} translation, 1–4 words (two meanings separated by ", " if both are common).\n` +
      `- "analogues": 2–4 other ways to say the same thing in ${langName(p.lang)} — synonyms or set phrases a native speaker would really use — as {"text", "level" (CEFR), "note"}: "note" says in ${uiName(p.uiLang)}, max 10 words, how it differs (simpler, more formal, stronger, colloquial, more precise…). ` +
      `For an A1–A2 word include at least one more precise or more advanced way; for a B1–B2 word include at least one simpler, more common way. For function words with no real alternative, give [] .\n` +
      `Reply with ONLY a JSON object {"items": [{"lemma", "theme", "translation", "analogues"}]} with exactly ${p.words.length} items, in the same order.`,
    messages: [{ role: "user", content: JSON.stringify(p.words) }],
  };
}

/** For each harder word: the basic word (from the given list) it branches from, or null. */
export const wordLinkSchema = (n: number) => z.object({ items: z.array(z.object({ lemma: z.string(), root: z.string().nullable() })).length(n) });

export function wordLinkPrompt(p: { lang: Lang; roots: { lemma: string; display: string; translation: string }[]; words: { lemma: string; display: string; translation: string }[] }): PromptSpec {
  return {
    id: "word_link",
    version: 1,
    system:
      `You draw a tree of the ${langName(p.lang)} vocabulary for a learner: basic words are the roots, and each harder word hangs under the basic word it is a more specific, stronger, more formal or more advanced way of saying, or is built from. ` +
      (p.lang === "no"
        ? `Examples: "gjennomføre" → "gjøre"; "gripe" → "ta"; "enorm" → "stor"; "spasere" → "gå"; "fortelle" → "si"; "arbeidsplass" → "arbeid".\n`
        : `Examples: "accomplish" → "do"; "grab" → "take"; "huge" → "big"; "stroll" → "walk"; "explain" → "say"; "workplace" → "work".\n`) +
      `Roots (lemma — display — translation): ${p.roots.map((r) => `${r.lemma} — ${r.display} — ${r.translation}`).join("; ")}.\n` +
      `For EACH word give "root": the lemma of the one best root from this list, exactly as written there, or null when no root is a natural parent (do not force it). ` +
      `Reply with ONLY a JSON object {"items": [{"lemma", "root"}]} with exactly ${p.words.length} items, in the same order.`,
    messages: [{ role: "user", content: JSON.stringify(p.words) }],
  };
}

// ---------- video transcript (offline import of public-domain videos) ----------
export const VideoTranscriptSchema = z.object({ text: z.string() });

/**
 * One short piece of a public-domain video's soundtrack (cut at pauses, so its time is measured, not asked)
 * → exactly what is said in it.
 */
export function videoTranscribePrompt(p: { lang: Lang; audio: { mimeType: string; data: string }; title: string }): PromptSpec {
  return {
    id: "video_transcribe",
    version: 2,
    system:
      `You transcribe a short clip from the soundtrack of a ${langName(p.lang)} learning video, for a learner who reads along while it plays. ` +
      `Write down exactly what is said, word for word, with normal punctuation and capitalisation: do not summarise, shorten, correct, translate or add anything. ` +
      `The clip may begin or end in the middle of a sentence: write only the words you hear. Leave out music, sound effects and descriptions of sounds. ` +
      `If nobody speaks or sings words, the text is "".\n` +
      `Reply with ONLY a JSON object {"text": "…"}.`,
    messages: [{ role: "user", content: `A clip from the video «${p.title}». Transcribe what is said.`, media: [p.audio] }],
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
    version: 2,
    system:
      `You are a warm, precise language teacher writing short feedback after a spoken role-play. ${LEARNER(s.lang, s.uiLang, s.level)}\n` +
      `Teaching rules: praise specifically; choose at most 2 fixes — the ones that matter most for being understood or that recur; ` +
      `for each fix write a HINT (max 15 words) that points her to WHERE to look — the word or part of the sentence — ` +
      `without stating the rule or the correct form, so she can find the fix herself (good: "Посмотрите, где стоит «ikke» после «fordi»"; ` +
      `bad: "«ikke» ставится перед глаголом"); ` +
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
