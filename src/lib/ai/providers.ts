/**
 * Thin, dependency-free adapters over each provider's HTTP API.
 * They all take the same CompletionRequest and return the same CompletionResult,
 * so a model can be swapped by changing configuration only.
 */
import { serverEnv } from "@/lib/env";
import { ProviderError, type CompletionRequest, type CompletionResult, type Provider, type ProviderAdapter } from "./types";

const TIMEOUT_MS = 60_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal, timeoutMs = TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ctl.abort());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(`HTTP ${res.status}: ${text.slice(0, 500)}`, res.status, retryable);
    }
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(e instanceof Error ? e.message : String(e), undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

/** Audio input is Gemini-only here; other providers refuse it (not retryable) so execute() moves on. */
function refuseMedia(req: CompletionRequest, provider: string) {
  if (req.messages.some((m) => m.media?.length)) throw new ProviderError(`${provider}: audio input is not supported here`, undefined, false);
}

export const anthropic: ProviderAdapter = {
  name: "anthropic",
  available: () => !!serverEnv.anthropicKey(),
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    refuseMedia(req, "anthropic");
    const data = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": serverEnv.anthropicKey(), "anthropic-version": "2023-06-01" },
      {
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        // Mark the (long, stable) system prompt as cacheable — cheaper repeated calls.
        system: req.system ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }] : undefined,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      req.signal,
    );
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const u = data.usage ?? {};
    return {
      text,
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
    };
  },
};

/**
 * Gemini thinking controls differ by generation: 2.5 uses thinkingBudget (0 = off);
 * 3.x uses thinkingLevel and cannot be fully disabled — "minimal" where supported, else "low".
 */
export function geminiThinking(model: string): Record<string, unknown> | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3\.(6-flash|5-flash-lite|1-flash-lite)/.test(model)) return { thinkingLevel: "minimal" };
  if (/^gemini-3/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

async function geminiGenerate(model: string, body: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = { "x-goog-api-key": serverEnv.googleKey() };
  try {
    return await postJson(url, headers, body, signal, timeoutMs);
  } catch (e) {
    // If a model rejects the thinking setting, retry once without it rather than failing the task.
    const gc = body.generationConfig as Record<string, unknown> | undefined;
    if (e instanceof ProviderError && e.status === 400 && gc?.thinkingConfig && /thinking/i.test(e.message)) {
      const { thinkingConfig: _drop, ...rest } = gc;
      void _drop;
      return postJson(url, headers, { ...body, generationConfig: rest }, signal, timeoutMs);
    }
    throw e;
  }
}

export const google: ProviderAdapter = {
  name: "google",
  available: () => !!serverEnv.googleKey(),
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const thinking = req.lowLatency ? geminiThinking(req.model) : undefined;
    const data = await geminiGenerate(
      req.model,
      {
        systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [...(m.media ?? []).map((x) => ({ inline_data: { mime_type: x.mimeType, data: x.data } })), { text: m.content }],
        })),
        generationConfig: {
          // Gemini counts thinking tokens against maxOutputTokens; give thinking models headroom
          // so the visible answer isn't cut off. Only tokens actually used are billed.
          maxOutputTokens: /^gemini-(2\.5|3)/.test(req.model) ? req.maxTokens + 4096 : req.maxTokens,
          // Google advises leaving Gemini 3 at its default temperature; lower values can cause repetition.
          temperature: /^gemini-3/.test(req.model) ? undefined : req.temperature,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
          // Fast path for short structured tasks: less thinking = lower latency and cost.
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      },
      req.signal,
      req.timeoutMs,
    );
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text && cand?.finishReason) throw new ProviderError(`Empty reply (finishReason ${cand.finishReason})`);
    const u = data.usageMetadata ?? {};
    return { text, inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
  },
};

export const openai: ProviderAdapter = {
  name: "openai",
  available: () => !!serverEnv.openaiKey(),
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    refuseMedia(req, "openai");
    const data = await postJson(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${serverEnv.openaiKey()}` },
      {
        model: req.model,
        max_completion_tokens: req.maxTokens,
        temperature: req.temperature,
        messages: [
          ...(req.system ? [{ role: "system", content: req.system }] : []),
          ...req.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      },
      req.signal,
    );
    const u = data.usage ?? {};
    return { text: data.choices?.[0]?.message?.content ?? "", inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
  },
};

export const adapters: Record<Provider, ProviderAdapter> = { anthropic, google, openai };
