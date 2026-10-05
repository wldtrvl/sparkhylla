/**
 * Build «Карта слов» for one language: the frequency list up to B2 (5000 forms) → dictionary words with
 * part of speech, level, theme, translation, other ways to say it, and the basic word each one branches from.
 * Resumable: every step only does the rows that are not done yet, so a rerun continues where it stopped.
 *
 *   npm run wordmap:build -- no              # all steps: lemma → tag → link
 *   npm run wordmap:build -- en --step=tag   # one step
 *   npm run wordmap:build -- no --limit=200  # only the 200 most frequent forms (a trial run)
 */
import { execute, type AttemptLog } from "@/lib/ai/execute";
import { wordLemmaPrompt, wordLemmaSchema, wordLinkPrompt, wordLinkSchema, wordTagPrompt, wordTagSchema, type Lang } from "@/lib/ai/prompts";
import { configuredRoutes, planAttempts } from "@/lib/ai/routing";
import type { Task } from "@/lib/ai/types";
import { asPos, CONTENT_POS, levelForRank, MAP_MAX_RANK, normalizeTerm, THEMES, THEME_KEYS } from "@/lib/learning/wordmap";
import freqEn from "@/data/freq-en.json";
import freqNo from "@/data/freq-no.json";
import { admin } from "./lib";

const TAG_VERSION = 1;
const POOL = 4;
const FREQ: Record<Lang, string[]> = { no: freqNo as string[], en: freqEn as string[] };

interface Row {
  lang: Lang;
  lemma: string;
  display: string;
  pos: string;
  forms: string[];
  rank: number;
  level: string;
  skip: boolean;
  theme: string | null;
  translation_ru: string | null;
  analogues: { text: string; level: string; note: string }[];
  root: string | null;
  linked: boolean;
  tag_version: number | null;
}

const db = admin();
let spent = 0;
const logs: Promise<unknown>[] = [];

function logAttempt(a: AttemptLog) {
  spent += a.costUsd ?? 0;
  logs.push(
    Promise.resolve(
      db.from("llm_calls").insert({
        user_id: null,
        task: a.task,
        prompt_id: a.promptId,
        prompt_version: a.promptVersion,
        provider: a.route.provider,
        model: a.route.model,
        variant: a.variant,
        input_tokens: a.inputTokens,
        output_tokens: a.outputTokens,
        cost_usd: a.costUsd,
        latency_ms: a.latencyMs,
        ok: a.ok,
        error: a.error ?? null,
        attempt: a.attempt,
      }),
    ),
  );
}

async function ask<T>(task: Task, prompt: Parameters<typeof execute<T>>[0]["prompt"], schema: Parameters<typeof execute<T>>[0]["schema"], maxTokens: number): Promise<T | null> {
  try {
    const r = await execute<T>({ task, prompt, schema, attempts: planAttempts(configuredRoutes(task)), maxTokens, temperature: 0.2, lowLatency: task !== "word_tag", onAttempt: logAttempt });
    return r.data;
  } catch (e) {
    console.log(`  ${task} batch failed: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    return null;
  }
}

/** Run `fn` over the batches, POOL at a time. */
async function pool<T>(batches: T[], fn: (b: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, batches.length) }, async () => {
      while (next < batches.length) {
        const i = next++;
        await fn(batches[i], i);
      }
    }),
  );
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function loadRows(lang: Lang): Promise<Map<string, Row>> {
  const rows = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("word_map").select("*").eq("lang", lang).range(from, from + 999);
    if (error) throw new Error(`${error.message} (run migration 0013)`);
    for (const r of data ?? []) rows.set(r.lemma, r as Row);
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function save(rows: Row[]) {
  for (const part of chunk(rows, 500)) {
    const { error } = await db.from("word_map").upsert(part.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "lang,lemma" });
    if (error) throw error;
  }
}

async function stepLemma(lang: Lang, rows: Map<string, Row>, limit: number) {
  const done = new Set([...rows.values()].flatMap((r) => r.forms));
  const todo = FREQ[lang]
    .slice(0, limit)
    .map((form, i) => ({ form, rank: i + 1 }))
    .filter((f) => !done.has(f.form) && /^\p{L}[\p{L}'’-]*$/u.test(f.form));
  console.log(`lemma: ${todo.length} forms to sort into dictionary words`);
  await pool(chunk(todo, 80), async (batch, i) => {
    const r = await ask("word_lemma", wordLemmaPrompt({ lang, forms: batch.map((b) => b.form) }), wordLemmaSchema(batch.length), 6000);
    if (!r) return;
    const changed = new Map<string, Row>();
    r.items.forEach((it, k) => {
      const { form, rank } = batch[k];
      const lemma = normalizeTerm(it.lemma || form);
      if (!lemma) return;
      const cur = rows.get(lemma);
      const level = levelForRank(Math.min(rank, cur?.rank ?? rank)) ?? "B2";
      const row: Row = cur
        ? { ...cur, forms: [...new Set([...cur.forms, form])], skip: cur.skip && it.skip, ...(rank < cur.rank ? { rank, level, display: it.display || cur.display, pos: asPos(it.pos) } : {}) }
        : { lang, lemma, display: it.display || lemma, pos: asPos(it.pos), forms: [form], rank, level, skip: it.skip, theme: null, translation_ru: null, analogues: [], root: null, linked: false, tag_version: null };
      rows.set(lemma, row);
      changed.set(lemma, row);
    });
    await save([...changed.values()]);
    if (i % 5 === 0) console.log(`  lemma batch ${i + 1}: ${rows.size} words so far`);
  });
}

async function stepTag(lang: Lang, rows: Map<string, Row>) {
  const todo = [...rows.values()].filter((r) => !r.skip && r.tag_version !== TAG_VERSION).sort((a, b) => a.rank - b.rank);
  console.log(`tag: ${todo.length} words to tag`);
  await pool(chunk(todo, 25), async (batch, i) => {
    const r = await ask(
      "word_tag",
      wordTagPrompt({ lang, uiLang: "ru", themes: THEMES, words: batch.map((w) => ({ lemma: w.lemma, display: w.display, pos: w.pos, level: w.level })) }),
      wordTagSchema(batch.length, THEME_KEYS),
      9000,
    );
    if (!r) return;
    const changed = batch.map((w, k) => {
      const it = r.items[k];
      const own = new Set([w.lemma, normalizeTerm(w.display)]);
      const row: Row = { ...w, theme: it.theme, translation_ru: it.translation.trim(), analogues: it.analogues.filter((a) => !own.has(normalizeTerm(a.text))), tag_version: TAG_VERSION };
      rows.set(w.lemma, row);
      return row;
    });
    await save(changed);
    if (i % 10 === 0) console.log(`  tag batch ${i + 1}/${Math.ceil(todo.length / 25)}`);
  });
}

const isRoot = (r: Row) => !r.skip && r.level === "A1" && CONTENT_POS.has(asPos(r.pos)) && r.theme !== "grammar";

async function stepLink(lang: Lang, rows: Map<string, Row>) {
  const all = [...rows.values()].filter((r) => !r.skip);
  const roots = all.filter(isRoot).sort((a, b) => a.rank - b.rank);
  const rootSet = new Set(roots.map((r) => r.lemma));
  // roots and function words need no parent
  const settled = all.filter((r) => !r.linked && (rootSet.has(r.lemma) || !CONTENT_POS.has(asPos(r.pos)) || r.theme === "grammar")).map((r) => ({ ...r, root: null, linked: true }));
  settled.forEach((r) => rows.set(r.lemma, r));
  await save(settled);
  const todo = all.filter((r) => !r.linked && !rootSet.has(r.lemma) && CONTENT_POS.has(asPos(r.pos)) && r.theme !== "grammar" && r.translation_ru).sort((a, b) => a.rank - b.rank);
  console.log(`link: ${roots.length} roots, ${todo.length} words to hang under them`);
  const rootList = roots.map((r) => ({ lemma: r.lemma, display: r.display, translation: r.translation_ru ?? "" }));
  await pool(chunk(todo, 80), async (batch, i) => {
    const r = await ask("word_link", wordLinkPrompt({ lang, roots: rootList, words: batch.map((w) => ({ lemma: w.lemma, display: w.display, translation: w.translation_ru ?? "" })) }), wordLinkSchema(batch.length), 6000);
    if (!r) return;
    const changed = batch.map((w, k) => {
      const root = r.items[k].root ? normalizeTerm(r.items[k].root!) : null;
      const row: Row = { ...w, root: root && rootSet.has(root) && root !== w.lemma ? root : null, linked: true };
      rows.set(w.lemma, row);
      return row;
    });
    await save(changed);
    if (i % 10 === 0) console.log(`  link batch ${i + 1}/${Math.ceil(todo.length / 80)}`);
  });
}

async function main() {
  const lang = process.argv[2] as Lang;
  if (lang !== "no" && lang !== "en") throw new Error("Usage: npm run wordmap:build -- <no|en> [--step=lemma|tag|link] [--limit=N]");
  const step = process.argv.find((a) => a.startsWith("--step="))?.slice(7);
  const limit = Math.min(MAP_MAX_RANK, Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? MAP_MAX_RANK));
  const rows = await loadRows(lang);
  console.log(`${lang}: ${rows.size} words in the map so far`);
  if (!step || step === "lemma") await stepLemma(lang, rows, limit);
  if (!step || step === "tag") await stepTag(lang, rows);
  if (!step || step === "link") await stepLink(lang, rows);
  await Promise.all(logs);
  const words = [...rows.values()].filter((r) => !r.skip);
  console.log(`done: ${words.length} words (${rows.size - words.length} skipped), tagged ${words.filter((r) => r.tag_version === TAG_VERSION).length}, linked ${words.filter((r) => r.linked).length}; AI cost $${spent.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
