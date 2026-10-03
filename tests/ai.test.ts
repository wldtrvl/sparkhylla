import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { execute } from "@/lib/ai/execute";
import { extractJson } from "@/lib/ai/json";
import { costUsd } from "@/lib/ai/pricing";
import { adapters } from "@/lib/ai/providers";
import { planAttempts } from "@/lib/ai/routing";
import type { Route } from "@/lib/ai/types";

describe("json extraction", () => {
  it("handles bare, fenced and wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} Hope it helps')).toEqual({ a: 3 });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("pricing", () => {
  it("matches dated model ids by prefix and returns null for unknown models", () => {
    expect(costUsd("anthropic", "claude-haiku-4-5-20251001", 1_000_000, 0)).toBeCloseTo(1);
    expect(costUsd("google", "gemini-2.5-flash-lite", 0, 1_000_000)).toBeCloseTo(0.4);
    expect(costUsd("google", "gemini-2.5-flash", 1_000_000, 0)).toBeCloseTo(0.3);
    expect(costUsd("openai", "some-model", 10, 10)).toBeNull();
  });
});

describe("routing", () => {
  const routes: Route[] = [
    { provider: "anthropic", model: "a", weight: 1 },
    { provider: "google", model: "g", weight: 3 },
    { provider: "openai", model: "o", weight: 0 },
  ];
  it("skips providers without keys and keeps the rest as fallbacks", () => {
    const plan = planAttempts(routes, (p) => p !== "anthropic", () => 0);
    expect(plan.map((r) => r.provider)).toEqual(["google", "openai"]);
  });
  it("picks by weight", () => {
    expect(planAttempts(routes, () => true, () => 0.1)[0].provider).toBe("anthropic"); // 0.1*4=0.4 < 1
    expect(planAttempts(routes, () => true, () => 0.9)[0].provider).toBe("google");
  });
  it("returns nothing when no provider is available", () => {
    expect(planAttempts(routes, () => false)).toEqual([]);
  });
});

describe("execute", () => {
  it("repairs invalid JSON once, then falls back to the next provider", async () => {
    const a = vi.spyOn(adapters.anthropic, "complete").mockResolvedValueOnce({ text: "oops", inputTokens: 5, outputTokens: 1 }).mockResolvedValueOnce({ text: '{"x":1}', inputTokens: 5, outputTokens: 1 });
    const logs: unknown[] = [];
    const r = await execute({
      task: "gloss",
      prompt: { id: "t", version: 1, system: "s", messages: [{ role: "user", content: "hi" }] },
      attempts: [{ provider: "anthropic", model: "claude-haiku-4-5", weight: 1 }],
      schema: z.object({ x: z.number() }),
      maxTokens: 10,
      onAttempt: (l) => void logs.push(l),
    });
    expect(r.data).toEqual({ x: 1 });
    expect(logs).toHaveLength(2);
    a.mockRestore();

    const fail = vi.spyOn(adapters.anthropic, "complete").mockRejectedValue(new Error("down"));
    const ok = vi.spyOn(adapters.google, "complete").mockResolvedValue({ text: '{"x":2}', inputTokens: 1, outputTokens: 1 });
    const r2 = await execute({
      task: "gloss",
      prompt: { id: "t", version: 1, system: "s", messages: [{ role: "user", content: "hi" }] },
      attempts: [
        { provider: "anthropic", model: "m", weight: 1 },
        { provider: "google", model: "gemini-2.5-flash", weight: 1 },
      ],
      schema: z.object({ x: z.number() }),
      maxTokens: 10,
    });
    expect(r2.data).toEqual({ x: 2 });
    expect(r2.route.provider).toBe("google");
    fail.mockRestore();
    ok.mockRestore();
  });
});

import { normalizeSupabaseUrl } from "@/lib/env";
import { geminiThinking } from "@/lib/ai/providers";

describe("config hygiene", () => {
  it("normalises pasted Supabase URLs", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co");
  });
  it("uses the right thinking control per Gemini generation", () => {
    expect(geminiThinking("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(geminiThinking("gemini-3.1-flash-lite")).toEqual({ thinkingLevel: "minimal" });
    expect(geminiThinking("gemini-3.8-flash")).toEqual({ thinkingLevel: "low" });
    expect(geminiThinking("other")).toBeUndefined();
  });
});
