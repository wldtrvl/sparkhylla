/**
 * Thin, dependency-free adapters over each provider's HTTP API.
 * They all take the same CompletionRequest and return the same CompletionResult,
 * so a model can be swapped by changing configuration only.
 */
import { serverEnv } from "@/lib/env";
import { ProviderError, type CompletionRequest, type CompletionResult, type Provider, type ProviderAdapter } from "./types";

const TIMEOUT_MS = 60_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
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

export const anthropic: ProviderAdapter = {
  name: "anthropic",
  available: () => !!serverEnv.anthropicKey(),
  async complete(req: CompletionRequest): Promise<CompletionResult> {
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

export const google: ProviderAdapter = {
  name: "google",
  available: () => !!serverEnv.googleKey(),
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
      { "x-goog-api-key": serverEnv.googleKey() },
      {
        systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: req.maxTokens,
          temperature: req.temperature,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
          // Flash models think by default; for short structured tasks that only adds latency and cost.
          ...(req.lowLatency && /flash/.test(req.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
      req.signal,
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
