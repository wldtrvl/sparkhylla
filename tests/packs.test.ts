import { describe, expect, it } from "vitest";
import { chooseKeyWords, chooseThemes, packGoal, PACK_THEMES, stepsFor, wordsSaid, type ThemeSignals } from "@/lib/learning/packs";

describe("«Набор дня»", () => {
  it("has more steps the more time she has", () => {
    expect(stepsFor(15).steps).toEqual(["warmup", "watch"]);
    expect(stepsFor(30).steps).toEqual(["warmup", "watch", "words", "talk"]);
    expect(stepsFor(45).steps).toEqual(["warmup", "watch", "words", "talk", "rule"]);
    expect(stepsFor(15).maxVideoWords).toBeLessThan(stepsFor(45).maxVideoWords);
  });

  it("offers themes with something to watch: loved and not done lately first", () => {
    const no = PACK_THEMES.filter((t) => t.lang === "no");
    const sig = (s: Partial<ThemeSignals>): ThemeSignals => ({ freshMaterial: 5, loved: 0, daysSince: null, untriedTalks: 0, ...s });
    const signals = new Map<string, ThemeSignals>(no.map((t) => [t.key, sig({ daysSince: 1 })]));
    signals.set("care", sig({ loved: 4, daysSince: 10 }));
    signals.set("work", sig({ loved: 2, untriedTalks: 2 }));
    signals.set("health", sig({ freshMaterial: 0, loved: 9 })); // nothing left to watch
    const offer = chooseThemes(no, signals);
    expect(offer).toHaveLength(3);
    expect(offer.map((o) => o.theme.key).slice(0, 2)).toEqual(["care", "work"]);
    expect(offer.map((o) => o.theme.key)).not.toContain("health");
    expect(offer[0].reason).toContain("понравилось: 4");
  });

  it("picks key words she does not know, useful and repeated in the video", () => {
    const vocab = [
      { form: "jobber", n: 6, rank: 400 }, // known (her level)
      { form: "vakt", n: 4, rank: 2100 },
      { form: "vakter", n: 2, rank: 2600 }, // same word as vakt
      { form: "turnus", n: 3, rank: 4200 },
      { form: "hofteprotese", n: 5, rank: 12000 }, // too rare to be worth it
      { form: "kollega", n: 1, rank: 1800 },
    ];
    const lemma: Record<string, { lemma: string; rank: number }> = {
      jobber: { lemma: "jobbe", rank: 400 },
      vakt: { lemma: "vakt", rank: 2100 },
      vakter: { lemma: "vakt", rank: 2100 },
      turnus: { lemma: "turnus", rank: 4200 },
      kollega: { lemma: "kollega", rank: 1800 },
    };
    const picked = chooseKeyWords(vocab, (f) => f === "jobber", (f) => lemma[f], 3);
    expect(picked).toEqual(["vakt", "turnus", "kollega"]);
  });

  it("finds the pack words she said aloud, in any form", () => {
    const words = [
      { lemma: "vakt", forms: ["vakt", "vakter", "vakten"] },
      { lemma: "turnus", forms: ["turnus"] },
      { lemma: "kollega", forms: ["kollega", "kolleger"] },
    ];
    expect(wordsSaid(words, ["Jeg har tre vakter i uka.", "Mine kolleger er hyggelige!"])).toEqual(["vakt", "kollega"]);
    expect(wordsSaid(words, [])).toEqual([]);
  });

  it("asks the conversation to use three pack words", () => {
    expect(packGoal(["vakt", "turnus", "kollega"]).ru).toBe("Использовать 3 слова из набора: vakt, turnus, kollega");
  });
});
