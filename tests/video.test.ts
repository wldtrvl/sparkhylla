import { describe, expect, it } from "vitest";
import { activeParagraph, asVideo, chunksFromSilences, clock, cuesToParagraphs, ndlaLicense, parseSilences, parseVtt } from "@/lib/video";

const VTT = `﻿WEBVTT

1
00:00:04.520 --> 00:00:07.080
Mat fra andre kulturer.

2
00:00:07.200 --> 00:00:13.560
Verden blir stadig mindre, og mat som var
eksotisk for 20 år siden, er nå helt dagligdags.

3
00:00:13.680 --> 00:00:18.160 align:start
<i>Men det er fremdeles spennende</i>
- å oppleve mattradisjoner fra andre land.

4
00:00:21.000 --> 00:00:23.000
- Hei! - Hei, hvordan går det?

5
00:00:23.500 --> 00:00:26.000
-Jonas? -Jeg er her, og jeg sier - at alt går fint – nesten. Han sier -

6
00:00:26.100 --> 00:00:28.000
at han kommer.
`;

describe("video transcripts", () => {
  it("reads WebVTT cues as plain text with times", () => {
    const cues = parseVtt(VTT);
    expect(cues).toHaveLength(6);
    expect(cues[4].text.endsWith("Han sier")).toBe(true);
    expect(cues[4].text).toBe("Jonas? Jeg er her, og jeg sier at alt går fint – nesten. Han sier");
    expect(cues[0]).toEqual({ s: 4.52, e: 7.08, text: "Mat fra andre kulturer." });
    expect(cues[2].text).toBe("Men det er fremdeles spennende å oppleve mattradisjoner fra andre land.");
    expect(cues[3].text).toBe("Hei! Hei, hvordan går det?");
  });

  it("groups cues into paragraphs at sentence ends and pauses, keeping their times", () => {
    const { paras, times } = cuesToParagraphs(parseVtt(VTT), { min: 60, max: 380, pause: 1.6 });
    expect(paras[0]).toBe("Mat fra andre kulturer. Verden blir stadig mindre, og mat som var eksotisk for 20 år siden, er nå helt dagligdags.");
    expect(times[0]).toEqual([4.52, 13.56]);
    expect(paras.join(" ")).toContain("Hei, hvordan går det?");
    expect(paras.at(-1)).toContain("Han sier at han kommer.");
    expect(times.at(-1)).toEqual([21, 28]);
  });

  it("finds the paragraph being spoken", () => {
    const times: [number, number][] = [
      [4.5, 13.5],
      [13.7, 18.2],
      [21, 23],
    ];
    expect(activeParagraph(times, 1)).toBeNull();
    expect(activeParagraph(times, 5)).toBe(0);
    expect(activeParagraph(times, 19)).toBe(1);
    expect(activeParagraph(times, 99)).toBe(2);
    expect(clock(75.4)).toBe("1:15");
  });

  it("accepts NDLA's Creative Commons licences and refuses «Opphavsrett»", () => {
    expect(ndlaLicense("Navngivelse-Del på samme vilkår")).toBe("CC BY-SA");
    expect(ndlaLicense("Navngivelse-Ikkekommersiell-Ingen Bearbeidelse")).toBe("CC BY-NC-ND");
    expect(ndlaLicense("Opphavsrett")).toBeNull();
    expect(ndlaLicense(undefined)).toBeNull();
  });

  it("only trusts well-formed video settings", () => {
    expect(asVideo({ provider: "brightcove", account: "1", player: "p", id: "2", paras: [[0, 1]] })?.provider).toBe("brightcove");
    expect(asVideo({ provider: "mp4", src: "http://insecure/x.mp4" })).toBeNull();
    expect(asVideo(null)).toBeNull();
  });
  it("cuts a soundtrack into pieces at pauses, with measured times", () => {
    const log = "[silencedetect] silence_start: 0\n[silencedetect] silence_end: 2.5 | silence_duration: 2.5\n[silencedetect] silence_start: 9.1\n[silencedetect] silence_end: 9.6\n[silencedetect] silence_start: 14.2\n[silencedetect] silence_end: 15\n";
    const silences = parseSilences(log);
    expect(silences).toEqual([[0, 2.5], [9.1, 9.6], [14.2, 15]]);
    // speech 2.5–9.1, 9.6–14.2, 15–60: the first piece closes at the first pause after 10 s
    const chunks = chunksFromSilences(silences, 60, { target: 10, max: 28, minSpeech: 0.6 });
    expect(chunks[0]).toEqual([2.5, 14.2]);
    // 45 s of music with no pause is cut into pieces of at most 28 s
    expect(chunks.slice(1).every(([a, b]) => b - a <= 28)).toBe(true);
    expect(chunks.at(-1)?.[1]).toBe(60);
  });
});
