import { serverEnv } from "@/lib/env";
import type { Provider } from "./types";

/**
 * USD per million tokens. Checked October 2026 against the providers' pricing pages
 * (platform.claude.com/docs/en/about-claude/pricing, ai.google.dev pricing).
 * Prices change — override without a deploy via AI_PRICE_OVERRIDES.
 * Matching is by prefix so dated model ids (e.g. claude-haiku-4-5-20251001) resolve.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  "anthropic:claude-haiku-4-5": { in: 1, out: 5 },
  "anthropic:claude-sonnet-5-5": { in: 2, out: 10 },
  "anthropic:claude-opus-5-5": { in: 4, out: 20 },
  "anthropic:claude-fable-5-1": { in: 10, out: 50 },
  // Gemini 3.6–3.8 Flash prices double on 1 Jan 2027 ($1.50 / $7.50) — update then or via AI_PRICE_OVERRIDES.
  "google:gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "google:gemini-3.7-flash": { in: 0.75, out: 3.75 },
  "google:gemini-3.6-flash": { in: 0.75, out: 3.75 },
  "google:gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "google:gemini-3.5-flash": { in: 1.5, out: 9 },
  "google:gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "google:gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google:gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "google:gemini-3.1-pro": { in: 2, out: 12 }, // ≤200k-token prompts
};

function table(): Record<string, { in: number; out: number }> {
  const raw = serverEnv.priceOverrides();
  if (!raw) return PRICES;
  try {
    return { ...PRICES, ...JSON.parse(raw) };
  } catch {
    return PRICES;
  }
}

/** Returns cost in USD, or null when the model has no known price (logged as unknown, never guessed). */
export function costUsd(provider: Provider, model: string, inputTokens: number, outputTokens: number): number | null {
  const t = table();
  const key = `${provider}:${model}`;
  const match = Object.keys(t)
    .filter((k) => key.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return null;
  const p = t[match];
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}
