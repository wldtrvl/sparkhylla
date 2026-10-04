import "server-only";
import type { ZodType } from "zod";
import { serverEnv } from "@/lib/env";
import { insertLater } from "@/lib/log";
import { adminClient } from "@/lib/supabase/admin";
import { execute, type AttemptLog, type ExecuteResult } from "./execute";
import { configuredRoutes, planAttempts, type DbRoute } from "./routing";
import type { PromptSpec, Task } from "./types";

let routeCache: { at: number; rows: DbRoute[] } | null = null;

async function dbRoutes(): Promise<DbRoute[]> {
  if (routeCache && Date.now() - routeCache.at < 60_000) return routeCache.rows;
  try {
    const { data } = await adminClient().from("model_routes").select("task,provider,model,weight").eq("active", true);
    routeCache = { at: Date.now(), rows: (data ?? []) as DbRoute[] };
  } catch {
    routeCache = { at: Date.now(), rows: [] };
  }
  return routeCache.rows;
}

function logAttempt(userId: string | null, a: AttemptLog) {
  const payloads = serverEnv.logAiPayloads();
  insertLater("llm_calls", {
      user_id: userId,
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
      request: payloads ? a.request : null,
      response: payloads ? (a.response ?? null) : null,
      created_at: new Date().toISOString(),
    });
}

export interface RunOptions<T> {
  task: Task;
  prompt: PromptSpec;
  userId: string | null;
  schema?: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  lowLatency?: boolean;
}

/** Run an AI task: pick a route (A/B by weight), fall back across providers, log every attempt. */
export async function runTask<T = string>(opts: RunOptions<T>): Promise<ExecuteResult<T>> {
  const attempts = planAttempts(configuredRoutes(opts.task, await dbRoutes()));
  return execute<T>({
    ...opts,
    attempts,
    onAttempt: (a) => logAttempt(opts.userId, a),
  });
}
