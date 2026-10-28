import { describe, expect, it } from "vitest";
import { GRAMMAR, RULE_KEYS } from "@/lib/learning/grammar";
import { PATTERNS, sentenceOf } from "@/lib/learning/sentences";

describe("grammar content", () => {
  it("has unique rule keys in both languages, each prefixed with its language", () => {
    const keys = GRAMMAR.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of GRAMMAR) expect(g.key.startsWith(`${g.lang}.`)).toBe(true);
    expect(GRAMMAR.filter((g) => g.lang === "no").length).toBeGreaterThanOrEqual(25);
    expect(GRAMMAR.filter((g) => g.lang === "en").length).toBeGreaterThanOrEqual(15);
    expect(RULE_KEYS).toContain("no.word_choice");
  });

  it("gives every rule examples, and mistakes that differ from their correction", () => {
    for (const g of GRAMMAR) {
      expect(g.examples.length, g.key).toBeGreaterThan(0);
      for (const [wrong, right] of g.mistakes ?? []) expect(wrong, g.key).not.toBe(right);
    }
  });

  it("links every sentence pattern to existing rules of its language", () => {
    const keys = new Set(GRAMMAR.map((g) => g.key));
    for (const p of PATTERNS) {
      expect(p.rules.length, p.key).toBeGreaterThan(0);
      for (const r of p.rules) {
        expect(keys.has(r), `${p.key} → ${r}`).toBe(true);
        expect(r.startsWith(`${p.lang}.`), `${p.key} → ${r}`).toBe(true);
      }
    }
  });

  it("writes every variation as a full sentence with its final mark", () => {
    for (const p of PATTERNS)
      for (const v of p.variations) {
        expect(v.parts.length, `${p.key}/${v.label}`).toBeGreaterThan(1);
        expect(sentenceOf(v), `${p.key}/${v.label}`).toMatch(/[.?!]$/);
        expect(v.ru.length, `${p.key}/${v.label}`).toBeGreaterThan(3);
      }
    expect(sentenceOf(PATTERNS[0].variations[0])).toBe("Jeg jobber i Oslo i dag.");
  });
});
