/**
 * Which model handles which task.
 *
 * Priority: database `model_routes` (active rows) > AI_ROUTES env JSON > defaults below.
 * Several routes per task with weights = an A/B test: each call is assigned by weight
 * and the choice is logged in llm_calls.variant, so models can be compared on real use.
 * Routes whose provider has no API key are skipped; the rest act as fallbacks in order.
 */
import { serverEnv } from "@/lib/env";
import { adapters } from "./providers";
import type { Provider, Route, Task } from "./types";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-5-5";
// Gemini: Flash for conversation and feedback, Flash-Lite for short lookups (stable ids, Oct 2026)
const FLASH = "gemini-3.8-flash";
const LITE = "gemini-3.1-flash-lite";

export const DEFAULT_ROUTES: Record<Task, Route[]> = {
  gloss: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: LITE, weight: 0 },
  ],
  talk_open: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: LITE, weight: 0 },
  ],
  tutor_turn: [
    { provider: "anthropic", model: SONNET, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  talk_help: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: LITE, weight: 0 },
  ],
  talk_feedback: [
    { provider: "anthropic", model: SONNET, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  explain: [
    { provider: "anthropic", model: SONNET, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  translate: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: LITE, weight: 0 },
  ],
  // «Карта слов» is built offline in batches (scripts/build-wordmap.ts)
  word_lemma: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  word_tag: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  word_link: [
    { provider: "anthropic", model: HAIKU, weight: 1 },
    { provider: "google", model: FLASH, weight: 0 },
  ],
  // audio input: Gemini only (other providers refuse audio, see providers.ts)
  video_transcribe: [{ provider: "google", model: FLASH, weight: 1 }],
  judge: [{ provider: "anthropic", model: SONNET, weight: 1 }],
};

export interface DbRoute {
  task: string;
  provider: Provider;
  model: string;
  weight: number;
}

function envRoutes(): Partial<Record<Task, Route[]>> {
  const raw = serverEnv.aiRoutes();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.error("AI_ROUTES is not valid JSON — ignoring it");
    return {};
  }
}

/** Configured routes for a task, before availability filtering. */
export function configuredRoutes(task: Task, dbRoutes: DbRoute[] = []): Route[] {
  const fromDb = dbRoutes.filter((r) => r.task === task).map(({ provider, model, weight }) => ({ provider, model, weight }));
  if (fromDb.length) return fromDb;
  return envRoutes()[task] ?? DEFAULT_ROUTES[task];
}

/**
 * Ordered attempt list: the weighted pick first, then the remaining available routes as fallbacks.
 * `rand` is injectable for tests.
 */
export function planAttempts(routes: Route[], isAvailable: (p: Provider) => boolean = (p) => adapters[p].available(), rand: () => number = Math.random): Route[] {
  const usable = routes.filter((r) => isAvailable(r.provider));
  if (!usable.length) return [];
  const weighted = usable.filter((r) => r.weight > 0);
  let first: Route;
  if (weighted.length) {
    const total = weighted.reduce((s, r) => s + r.weight, 0);
    let x = rand() * total;
    first = weighted[weighted.length - 1];
    for (const r of weighted) {
      if ((x -= r.weight) < 0) {
        first = r;
        break;
      }
    }
  } else {
    first = usable[0];
  }
  return [first, ...usable.filter((r) => r !== first)];
}

export const variantLabel = (r: Route) => `${r.provider}:${r.model}`;
