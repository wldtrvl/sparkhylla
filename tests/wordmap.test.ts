import { describe, expect, it } from "vitest";
import { focusLevel, levelForRank, normalizeTerm, planMarks, progress, statusIndex, statusOf, trees, type MapWord } from "@/lib/learning/wordmap";

const word = (lemma: string, rank: number, extra: Partial<MapWord> = {}): MapWord => ({
  lemma,
  display: lemma,
  pos: "verb",
  forms: [lemma],
  rank,
  level: levelForRank(rank) ?? "B2",
  theme: "actions",
  translation: "",
  root: null,
  ...extra,
});

describe("word map", () => {
  it("puts ranks into the reading-fit bands, up to B2", () => {
    expect(levelForRank(1)).toBe("A1");
    expect(levelForRank(700)).toBe("A1");
    expect(levelForRank(701)).toBe("A2");
    expect(levelForRank(5000)).toBe("B2");
    expect(levelForRank(5001)).toBeNull();
  });

  it("compares words without article, «å» or «to»", () => {
    expect(normalizeTerm("Å gå")).toBe("gå");
    expect(normalizeTerm("en bil")).toBe("bil");
    expect(normalizeTerm("to go")).toBe("go");
    expect(normalizeTerm(" Hus. ")).toBe("hus");
  });

  it("finds her status by any saved form, and «known» wins over «learning»", () => {
    const ga = word("gå", 50, { forms: ["går", "gikk", "gå"] });
    const idx = statusIndex([
      { term: "gikk", lemma: null, status: "learning" },
      { term: "å gå", lemma: "å gå", status: "known" },
      { term: "ta", lemma: null, status: "ignored" },
    ]);
    expect(statusOf(ga, idx)).toBe("known");
    expect(statusOf(word("ta", 60), idx)).toBe("new");
    expect(statusOf(word("se", 70, { forms: ["ser", "så"] }), statusIndex([{ term: "ser", lemma: null, status: "learning" }]))).toBe("learning");
  });

  it("counts progress per level and opens the first level not mostly known", () => {
    const ws = [word("a", 1), word("b", 2), word("c", 800), word("d", 3500)];
    const known = new Set(["a", "b"]);
    const p = progress(ws, (w) => (known.has(w.lemma) ? "known" : "new"));
    expect(p.all).toEqual({ total: 4, known: 2, learning: 0 });
    expect(p.byLevel.A1.known).toBe(2);
    expect(focusLevel(p.byLevel)).toBe("A2");
  });

  it("hangs harder words under their basic word, most frequent first", () => {
    const gjore = word("gjøre", 52);
    const ws = [word("utføre", 2200, { root: "gjøre" }), word("foreta", 4100, { root: "gjøre" }), gjore, word("hm", 3000)];
    const t = trees(ws, new Map([["gjøre", gjore]]));
    expect(t.trees).toHaveLength(1);
    expect(t.trees[0].branch.map((w) => w.lemma)).toEqual(["utføre", "foreta"]);
    expect(t.loose.map((w) => w.lemma)).toEqual(["hm"]);
  });
});

describe("marking on the map", () => {
  const ga = word("gå", 50, { forms: ["går", "gikk", "gå"] });
  const ta = word("ta", 60, { forms: ["tar", "tok", "ta"] });
  const se = word("se", 70);
  const mine = [
    { id: "w1", term: "gikk", lemma: null, status: "learning" }, // in review: protected
    { id: "w2", term: "å ta", lemma: "å ta", status: "known" },
  ];

  it("a group «Знаю» adds new words and leaves words in review alone", () => {
    const p = planMarks([ga, ta, se], mine, "known", false);
    expect(p).toEqual({ insert: ["se"], toKnown: [], toLearning: [], remove: [] });
  });

  it("«Знаю» on one word in review moves that word to known", () => {
    expect(planMarks([ga], mine, "known", true).toKnown).toEqual(["w1"]);
  });

  it("taking the mark off removes only «знаю», never a word in review", () => {
    expect(planMarks([ga, ta], mine, "none", false).remove).toEqual(["w2"]);
  });

  it("«Учить» puts a known word back into review", () => {
    const p = planMarks([ta, se], mine, "learning", false);
    expect(p.toLearning).toEqual(["w2"]);
    expect(p.insert).toEqual(["se"]);
  });
});
