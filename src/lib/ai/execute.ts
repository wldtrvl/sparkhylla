/**
 * Provider-neutral execution: try routes in order, parse + validate JSON, repair once.
 * No database access here, so the offline evaluation script can reuse it.
 */
import type { ZodType } from "zod";
import { extractJson } from "./json";
import { costUsd } from "./pricing";
import { adapters } from "./providers";
import { variantLabel } from "./routing";
import { ProviderError, type ChatMessage, type PromptSpec, type Route, type Task } from "./types";

export interface AttemptLog {
  task: Task;
  promptId: string;
  promptVersion: number;
  route: Route;
  variant: string;
  attempt: number;
  ok: boolean;
  error?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  request: { system?: string; messages: ChatMessage[] };
  response?: string;
}

export interface ExecuteOptions<T> {
  task: Task;
  prompt: PromptSpec;
  attempts: Route[];
  schema?: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  /** Fast path: turn off "thinking" where a provider allows it (short structured tasks). */
  lowLatency?: boolean;
  timeoutMs?: number;
  onAttempt?: (log: AttemptLog) => void | Promise<void>;
}

export interface ExecuteResult<T> {
  data: T;
  text: string;
  route: Route;
  variant: string;
}

export class NoRouteError extends Error {}

const RETRY_DELAY_MS = 400;

export async function execute<T = string>(opts: ExecuteOptions<T>): Promise<ExecuteResult<T>> {
  if (!opts.attempts.length) throw new NoRouteError(`No AI provider configured for task "${opts.task}". Add an API key in .env.`);
  let lastError: unknown;
  let n = 0;
  for (const route of opts.attempts) {
    const adapter = adapters[route.provider];
    let messages = opts.prompt.messages;
    let retried = false;
    // up to 2 tries per route: the original, and one JSON repair if parsing/validation failed
    for (let repair = 0; repair < (opts.schema ? 2 : 1); repair++) {
      n++;
      const started = Date.now();
      const log: AttemptLog = {
        task: opts.task,
        promptId: opts.prompt.id,
        promptVersion: opts.prompt.version,
        route,
        variant: variantLabel(route),
        attempt: n,
        ok: false,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 0,
        request: { system: opts.prompt.system, messages },
      };
      try {
        const res = await adapter.complete({
          model: route.model,
          system: opts.prompt.system,
          messages,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          json: !!opts.schema,
          lowLatency: opts.lowLatency,
          timeoutMs: opts.timeoutMs,
        });
        log.latencyMs = Date.now() - started;
        log.inputTokens = res.inputTokens;
        log.outputTokens = res.outputTokens;
        log.costUsd = costUsd(route.provider, route.model, res.inputTokens, res.outputTokens);
        log.response = res.text;
        if (!opts.schema) {
          log.ok = true;
          await opts.onAttempt?.(log);
          return { data: res.text as T, text: res.text, route, variant: log.variant };
        }
        const parsed = opts.schema.safeParse(extractJsonSafe(res.text));
        if (parsed.success) {
          log.ok = true;
          await opts.onAttempt?.(log);
          return { data: parsed.data, text: res.text, route, variant: log.variant };
        }
        log.error = `invalid_json: ${parsed.error.message.slice(0, 300)}`;
        await opts.onAttempt?.(log);
        lastError = new Error(log.error);
        messages = [
          ...opts.prompt.messages,
          { role: "assistant", content: res.text },
          { role: "user", content: "Your reply did not match the required JSON format. Reply again with ONLY the JSON object, exactly in the requested shape, and nothing else." },
        ];
      } catch (e) {
        log.latencyMs = Date.now() - started;
        log.error = e instanceof Error ? e.message.slice(0, 500) : String(e);
        await opts.onAttempt?.(log);
        lastError = e;
        // rate limit or server error (429/5xx): one short retry on the same route, then fall back.
        // Timeouts and client errors (bad key, bad model id) move on to the next route immediately.
        if (e instanceof ProviderError && e.retryable && e.status != null && !retried) {
          retried = true;
          repair--;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function extractJsonSafe(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return undefined;
  }
}
