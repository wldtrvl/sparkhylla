import { describe, expect, it } from "vitest";
import { checkAnswer } from "@/lib/learning/answer";
import { coverage, fitFromLevel, fitGroup, frequencyBand, tokenize } from "@/lib/learning/coverage";
import { quoteOfDay, type Quote } from "@/lib/learning/quotes";
import { newCard, schedule } from "@/lib/learning/srs";
import { paginate, paragraphText } from "@/lib/text-format";

describe("coverage", () => {
  it("tokenizes Norwegian letters and keeps sentence starts", () => {
    const t = tokenize("Hun gikk til Bodø. Der møtte hun Kari.");
    expect(t.map((x) => x.norm)).toEqual(["hun", "gikk", "til", "bodø", "der", "møtte", "hun", "kari"]);
    expect(t[4].sentenceStart).toBe(true);
    expect(t[3].sentenceStart).toBe(false);
  });
  it("counts frequent words as known and proper nouns as known", () => {
    const known = { band: frequencyBand("no", "B1"), own: new Set<string>() };
    const c = coverage("Jeg har vært i Bergen med Kari.", known);
    expect(c.total).toBe(7);
    expect(c.coverage).toBe(1);
  });
  it("lists rare words as unknown, and the learner's own words are known", () => {
    const band = frequencyBand("no", "A2");
    const c1 = coverage("Han måtte hogge ved i skogen.", { band, own: new Set() });
    expect(c1.unknown).toContain("hogge");
    const c2 = coverage("Han måtte hogge ved i skogen.", { band, own: new Set(["hogge"]) });
    expect(c2.unknown).not.toContain("hogge");
  });
  it("groups by fit thresholds", () => {
    expect(fitGroup(0.97)).toBe("fits");
    expect(fitGroup(0.92)).toBe("stretch");
    expect(fitGroup(0.8)).toBe("later");
    expect(fitFromLevel("B2", "B1")).toBe("stretch");
    expect(fitFromLevel("A2", "B1")).toBe("fits");
  });
});

describe("answers", () => {
  it("accepts exact, article-less and one-slip answers", () => {
    expect(checkAnswer("lettet", "lettet")).toBe("correct");
    expect(checkAnswer("Lettet.", "lettet")).toBe("correct");
    expect(checkAnswer("å hogge", "hogge")).toBe("correct");
    expect(checkAnswer("letet", "lettet")).toBe("close");
    expect(checkAnswer("glad", "lettet")).toBe("wrong");
  });
});

describe("spaced repetition", () => {
  it("pushes a remembered card further than a forgotten one", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    let card = newCard(now);
    // first good review, then one week later another good
    const a = schedule(card, "good", now);
    card = a.after;
    const later = new Date(a.due.getTime() + 1000);
    const good = schedule(card, "good", later);
    const forgot = schedule(card, "forgot", later);
    expect(good.due.getTime()).toBeGreaterThan(forgot.due.getTime());
    expect(typeof good.after.due).toBe("string");
  });
});

describe("quote of the day", () => {
  const q = (id: number, origin: "norway" | "world"): Quote => ({ id, origin, text: `q${id}`, text_lang: "en", translation_ru: "", translation_uk: null, author: "", author_note: null, status: "sourced", source: null });
  const quotes = [q(1, "norway"), q(2, "norway"), q(3, "world"), q(4, "world"), q(5, "world")];
  it("is stable within a day and alternates origin", () => {
    const d1 = new Date("2026-10-03T08:00:00Z");
    const d1b = new Date("2026-10-03T20:00:00Z");
    const d2 = new Date("2026-10-04T08:00:00Z");
    expect(quoteOfDay(quotes, d1)?.id).toBe(quoteOfDay(quotes, d1b)?.id);
    expect(quoteOfDay(quotes, d1)?.origin).not.toBe(quoteOfDay(quotes, d2)?.origin);
  });
  it("cycles through all quotes of a group", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) seen.add(quoteOfDay(quotes, new Date(Date.UTC(2026, 9, 1 + i, 9)))!.id);
    expect(seen.size).toBe(5);
  });
});

describe("book pages", () => {
  it("starts a new page at a heading once the page is a third full, and keeps paragraphs whole", () => {
    const tale = "Det var en gang en mann som bodde i skogen. ".repeat(4).trim(); // ~180 characters
    const body = `## Første eventyr\n\n${tale}\n\n## Andre eventyr\n\n${tale}\n\n## Kort del\n\nEn setning.\n\n## Neste del\n\nSiste avsnitt.`;
    const pages = paginate(body, 400);
    expect(pages[0]).toEqual(["## Første eventyr", tale]);
    expect(pages[1][0]).toBe("## Andre eventyr");
    // a short section does not get a page of its own
    expect(pages.flat().map(paragraphText)).toContain("Siste avsnitt.");
    expect(pages.find((pg) => pg.includes("## Kort del"))).toContain("## Neste del");
  });
});
