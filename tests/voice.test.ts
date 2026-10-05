import { describe, expect, it } from "vitest";
import { pickVoice, speechChunks } from "@/lib/voice";

const v = (name: string, lang: string) => ({ name, lang });

describe("browser voice", () => {
  it("skips macOS joke and robotic voices and takes a natural American one", () => {
    const mac = [v("Albert", "en-US"), v("Bad News", "en-US"), v("Daniel", "en-GB"), v("Eddy (English (United States))", "en-US"), v("Samantha", "en-US"), v("Zarvox", "en-US"), v("Nora", "nb-NO")];
    expect(pickVoice(mac, "en")?.name).toBe("Samantha");
    expect(pickVoice(mac, "no")?.name).toBe("Nora");
  });
  it("prefers premium and natural voices", () => {
    expect(pickVoice([v("Samantha", "en-US"), v("Ava (Premium)", "en-US")], "en")?.name).toBe("Ava (Premium)");
    expect(pickVoice([v("Microsoft Zira - English (United States)", "en-US"), v("Microsoft Aria Online (Natural) - English (United States)", "en-US")], "en")?.name).toMatch(/Aria/);
  });
  it("falls back to another English voice rather than a joke one, and to none at all", () => {
    expect(pickVoice([v("Albert", "en-US"), v("Daniel", "en-GB")], "en")?.name).toBe("Daniel");
    expect(pickVoice([v("Albert", "en-US"), v("Zarvox", "en-US")], "en")).toBeNull();
    expect(pickVoice([], "no")).toBeNull();
  });
  it("on Chrome for Windows takes Google US English over the old Microsoft voices", () => {
    const chromeWin = [
      v("Microsoft David - English (United States)", "en-US"),
      v("Microsoft Mark - English (United States)", "en-US"),
      v("Microsoft Zira - English (United States)", "en-US"),
      v("Microsoft Jon - Norwegian (Bokmål)", "nb-NO"),
      v("Google Deutsch", "de-DE"),
      v("Google US English", "en-US"),
      v("Google UK English Female", "en-GB"),
    ];
    expect(pickVoice(chromeWin, "en")?.name).toBe("Google US English");
    expect(pickVoice(chromeWin, "no")?.name).toBe("Microsoft Jon - Norwegian (Bokmål)");
  });
  it("speaks a sentence at a time, cutting long sentences at commas", () => {
    expect(speechChunks("Det var en gang en mann. Han bodde i skogen!")).toEqual(["Det var en gang en mann.", "Han bodde i skogen!"]);
    const long = Array.from({ length: 12 }, (_, i) => `part number ${i} of a very long sentence`).join(", ") + ".";
    const parts = speechChunks(long, 120);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.length <= 120)).toBe(true);
    expect(parts.join(" ")).toBe(long);
  });
});
