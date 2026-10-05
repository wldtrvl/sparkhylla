import { describe, expect, it } from "vitest";
import { pickVoice } from "@/lib/voice";

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
});
