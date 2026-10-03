/**
 * Offline model comparison on fixed test cases.
 *
 *   npm run eval                                  # every model in EVAL_MODELS below that has an API key
 *   EVAL_MODELS='[{"provider":"google","model":"gemini-2.5-flash"}]' npm run eval
 *   EVAL_JUDGE='{"provider":"anthropic","model":"claude-sonnet-5-5"}' npm run eval   # judge model (optional, default Sonnet)
 *
 * For each case × model it records: valid JSON?, latency, tokens, cost, the output, and a 1–5 judge score
 * with a reason. Results go to eval-results/<timestamp>.json and .md. The judge is a model too — read the
 * outputs yourself for the cases that matter; scores are a guide, not a verdict.
 */
import { mkdir, writeFile } from "node:fs/promises";
import type { ZodType } from "zod";
import { execute, type AttemptLog } from "@/lib/ai/execute";
import {
  FeedbackSchema,
  glossPrompt,
  GlossSchema,
  judgePrompt,
  JudgeSchema,
  talkHelpPrompt,
  TalkHelpSchema,
  tutorTurnPrompt,
  TutorTurnSchema,
  feedbackPrompt,
  type ScenarioCtx,
} from "@/lib/ai/prompts";
import { adapters } from "@/lib/ai/providers";
import type { PromptSpec, Route, Task } from "@/lib/ai/types";

const DEFAULT_MODELS: Route[] = [
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", weight: 1 },
  { provider: "anthropic", model: "claude-sonnet-5-5", weight: 1 },
  { provider: "google", model: "gemini-2.5-flash", weight: 1 },
  { provider: "google", model: "gemini-2.5-flash-lite", weight: 1 },
];

const doctor: ScenarioCtx = {
  persona: "Kari, receptionist at legekontoret, friendly and calm",
  setting: "Phone call to a GP office in Norway. The learner has an appointment on Thursday and needs to move it.",
  goals: [
    { id: "greet", ru: "Поздороваться и представиться" },
    { id: "reason", ru: "Объяснить, почему не можете прийти" },
    { id: "new_time", ru: "Договориться о новом времени" },
  ],
  lang: "no",
  level: "B1",
  uiLang: "ru",
};

interface Case {
  name: string;
  task: Task;
  prompt: PromptSpec;
  schema: ZodType<unknown>;
  maxTokens: number;
  rubric: string;
}

const CASES: Case[] = [
  {
    name: "gloss: hogge ved (fixed expression)",
    task: "gloss",
    prompt: glossPrompt({ lang: "no", uiLang: "ru", level: "B1", term: "hogge", sentence: "Derfor sa han til den eldste sønnen at han måtte gå og hogge ved." }),
    schema: GlossSchema,
    maxTokens: 400,
    rubric: "Translation correct in context (рубить дрова); lemma 'å hogge'; forms plausible; note mentions 'hogge ved'; concise; Russian is natural.",
  },
  {
    name: "gloss: English word with Norwegian bridge",
    task: "gloss",
    prompt: glossPrompt({ lang: "en", uiLang: "ru", level: "A2", term: "underneath", sentence: "They lived with their Mother in a sand-bank, underneath the root of a very big fir-tree." }),
    schema: GlossSchema,
    maxTokens: 400,
    rubric: "Correct Russian (под); a correct Norwegian equivalent (under/nedenfor); short; no errors.",
  },
  {
    name: "gloss: false friend 'rar'",
    task: "gloss",
    prompt: glossPrompt({ lang: "no", uiLang: "ru", level: "B1", term: "rar", sentence: "Han er litt rar, men veldig snill." }),
    schema: GlossSchema,
    maxTokens: 400,
    rubric: "Must say 'странный' (not 'редкий'); ideally warns it is not 'rare'.",
  },
  {
    name: "tutor turn: subclause ikke mistake",
    task: "tutor_turn",
    prompt: tutorTurnPrompt(doctor, [
      { role: "tutor", text: "Legekontoret, dette er Kari. Hva kan jeg hjelpe deg med?" },
      { role: "learner", text: "Hei, jeg har time på torsdag, men jeg kan ikke komme fordi jeg jobber ikke den dagen er… nei, fordi jeg må jobbe." },
    ]),
    schema: TutorTurnSchema,
    maxTokens: 700,
    rubric:
      "Reply stays in character, short, B1 Norwegian, does NOT correct her; offers a new time or asks which day; notes capture a real issue if any (ikke placement) with rule_key no.subclause_adverb, without inventing errors; goals_done includes 'reason' (and arguably greet).",
  },
  {
    name: "tutor turn: learner switches to Russian",
    task: "tutor_turn",
    prompt: tutorTurnPrompt(doctor, [
      { role: "tutor", text: "Hvilken dag passer for deg neste uke?" },
      { role: "learner", text: "Понедельник… mandag, kanskje etter обеда?" },
    ]),
    schema: TutorTurnSchema,
    maxTokens: 700,
    rubric: "Reply gives the Norwegian for 'after lunch' (etter lunsj) naturally inside the reply, invites her to continue, stays in character; learner_used_l1 true.",
  },
  {
    name: "help: what to say next",
    task: "talk_help",
    prompt: talkHelpPrompt(doctor, [{ role: "tutor", text: "Passer mandag klokka ti?" }]),
    schema: TalkHelpSchema,
    maxTokens: 250,
    rubric: "One short natural B1 sentence accepting or proposing a time; correct Russian translation.",
  },
  {
    name: "feedback after a short conversation",
    task: "talk_feedback",
    prompt: feedbackPrompt(
      doctor,
      [
        { role: "tutor", text: "Legekontoret, dette er Kari. Hva kan jeg hjelpe deg med?" },
        { role: "learner", text: "Hei, jeg heter Natalia. Jeg har time på torsdag men jeg kan ikke komme fordi jeg jobber ikke." },
        { role: "tutor", text: "Det går fint. Hvilken dag passer for deg?" },
        { role: "learner", text: "Kan jeg komme i mandag?" },
        { role: "tutor", text: "Ja, mandag klokka ti passer fint." },
        { role: "learner", text: "Tusen takk, ha det bra!" },
      ],
      [
        { said: "fordi jeg jobber ikke", issue: "adverb placement in subordinate clause", correction: "fordi jeg ikke jobber", rule_key: "no.subclause_adverb" },
        { said: "i mandag", issue: "wrong preposition with weekday", correction: "på mandag", rule_key: "no.preposition_time" },
      ],
      { "no.subclause_adverb": 3 },
    ),
    schema: FeedbackSchema,
    maxTokens: 1200,
    rubric:
      "Warm, specific summary in Russian; max 2 fixes; hints do NOT reveal the answer; corrections are right (ikke jobber, på mandag); prioritises the recurring rule; new_phrases useful and correct.",
  },
];

function modelsFromEnv(): Route[] {
  if (!process.env.EVAL_MODELS) return DEFAULT_MODELS;
  return (JSON.parse(process.env.EVAL_MODELS) as Omit<Route, "weight">[]).map((r) => ({ ...r, weight: 1 }));
}

async function main() {
  const models = modelsFromEnv().filter((m) => adapters[m.provider].available());
  if (!models.length) throw new Error("No models with API keys. Set ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY in .env.local");
  const judge: Route = process.env.EVAL_JUDGE ? { ...JSON.parse(process.env.EVAL_JUDGE), weight: 1 } : { provider: "anthropic", model: "claude-sonnet-5-5", weight: 1 };
  const judgeOn = adapters[judge.provider].available();
  const runs = Number(process.env.EVAL_RUNS ?? 1);
  const results: Record<string, unknown>[] = [];

  for (const c of CASES) {
    for (const m of models) {
      for (let run = 1; run <= runs; run++) {
        const logs: AttemptLog[] = [];
        let output = "";
        let ok = false;
        try {
          const r = await execute({ task: c.task, prompt: c.prompt, attempts: [m], schema: c.schema, maxTokens: c.maxTokens, temperature: 0.3, lowLatency: c.task === "gloss" || c.task === "talk_help", onAttempt: (l) => void logs.push(l) });
          output = JSON.stringify(r.data, null, 1);
          ok = true;
        } catch (e) {
          output = `ERROR: ${e instanceof Error ? e.message : e}`;
        }
        let score: number | null = null;
        let reason = "";
        if (ok && judgeOn) {
          try {
            const j = await execute({
              task: "judge",
              prompt: judgePrompt({ task: c.name, rubric: c.rubric, input: c.prompt.messages.map((x) => x.content).join("\n"), output }),
              attempts: [judge],
              schema: JudgeSchema,
              maxTokens: 300,
              temperature: 0,
            });
            score = j.data.score;
            reason = j.data.reason;
          } catch {
            reason = "judge failed";
          }
        }
        const row = {
          case: c.name,
          task: c.task,
          model: `${m.provider}:${m.model}`,
          run,
          ok,
          repairs: logs.length - 1,
          latency_ms: logs.reduce((a, l) => a + l.latencyMs, 0),
          input_tokens: logs.reduce((a, l) => a + l.inputTokens, 0),
          output_tokens: logs.reduce((a, l) => a + l.outputTokens, 0),
          cost_usd: logs.reduce((a, l) => a + (l.costUsd ?? 0), 0),
          score,
          reason,
          output,
        };
        results.push(row);
        console.log(`${row.ok ? "✓" : "✗"} ${c.name} · ${row.model} · ${row.latency_ms} ms · $${row.cost_usd.toFixed(5)} · score ${score ?? "—"}`);
      }
    }
  }

  // summary per model
  const byModel = new Map<string, Record<string, unknown>[]>();
  for (const r of results) byModel.set(String(r.model), [...(byModel.get(String(r.model)) ?? []), r]);
  const summary = [...byModel.entries()].map(([model, rs]) => {
    const scored = rs.filter((r) => r.score != null);
    return {
      model,
      cases: rs.length,
      valid_pct: Math.round((rs.filter((r) => r.ok).length / rs.length) * 100),
      avg_score: scored.length ? +(scored.reduce((a, r) => a + Number(r.score), 0) / scored.length).toFixed(2) : null,
      avg_latency_ms: Math.round(rs.reduce((a, r) => a + Number(r.latency_ms), 0) / rs.length),
      total_cost_usd: +rs.reduce((a, r) => a + Number(r.cost_usd), 0).toFixed(5),
    };
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir("eval-results", { recursive: true });
  await writeFile(`eval-results/${stamp}.json`, JSON.stringify({ judge: judgeOn ? judge : null, summary, results }, null, 2));
  const md = [
    `# Model evaluation ${stamp}`,
    "",
    `Judge: ${judgeOn ? `${judge.provider}:${judge.model}` : "none (no key)"} · runs per case: ${runs}`,
    "",
    "| Model | Valid JSON | Avg score (1–5) | Avg latency | Cost (all cases) |",
    "|---|---|---|---|---|",
    ...summary.map((s) => `| ${s.model} | ${s.valid_pct}% | ${s.avg_score ?? "—"} | ${s.avg_latency_ms} ms | $${s.total_cost_usd} |`),
    "",
    ...results.map((r) => `## ${r.case} — ${r.model}\n\nScore: ${r.score ?? "—"} · ${r.reason}\n\n\`\`\`json\n${r.output}\n\`\`\`\n`),
  ].join("\n");
  await writeFile(`eval-results/${stamp}.md`, md);
  console.table(summary);
  console.log(`Saved eval-results/${stamp}.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
