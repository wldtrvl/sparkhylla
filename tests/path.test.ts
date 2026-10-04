import { describe, expect, it } from "vitest";
import { computePath, type PathInput } from "@/lib/learning/path";

const base: PathInput = {
  level: "B1",
  words: 0,
  due: 0,
  textsFinished: 0,
  reading: null,
  suggested: { id: "t1", title: "Fjord" },
  talks: 0,
  scenario: { id: "s1", title: "У врача" },
  grammarDone: [],
  grammarTopics: [
    { key: "a", title: "V2", level: "A2" },
    { key: "b", title: "Passiv", level: "B1" },
    { key: "c", title: "Konjunktiv", level: "B2" },
  ],
  activeDays: 0,
};

describe("learning path", () => {
  it("measures each track against the level's targets and counts topics up to the level", () => {
    const p = computePath({ ...base, words: 450, textsFinished: 5, grammarDone: ["a"] });
    expect(p.level).toBe("B1");
    expect(p.next).toBe("B2");
    const t = Object.fromEntries(p.tracks.map((x) => [x.key, x]));
    expect(t.words).toMatchObject({ done: 450, target: 900 });
    expect(t.grammar).toMatchObject({ done: 1, target: 2, hint: "Тема: Passiv" }); // B2 topic not counted at B1
    expect(p.ready).toBe(false);
    expect(p.progress).toBeGreaterThan(0.2);
  });

  it("is ready for the next level when every track is complete", () => {
    const p = computePath({ ...base, words: 900, textsFinished: 15, talks: 10, grammarDone: ["a", "b"], activeDays: 9 });
    expect(p.ready).toBe(true);
    expect(p.progress).toBe(1);
  });

  it("picks one next step: due words first, then the started book, then the weakest track", () => {
    expect(computePath({ ...base, due: 4 }).step.href).toBe("/words");
    expect(computePath({ ...base, reading: { id: "r1", title: "Sult" } }).step.href).toBe("/read/r1");
    expect(computePath({ ...base, words: 900, textsFinished: 15, grammarDone: ["a", "b"] }).step.href).toBe("/talk/s1");
  });

  it("has no next level at C2 and treats unknown levels as B1", () => {
    expect(computePath({ ...base, level: "C2" }).next).toBeNull();
    expect(computePath({ ...base, level: "??" }).level).toBe("B1");
  });
});
