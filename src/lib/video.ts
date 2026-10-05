/**
 * Videos with a transcript: the transcript is the text body (paragraphs), and `paras` says when each paragraph
 * is spoken, so the reader can highlight it and the player can jump to it. Pure helpers, shared by the import
 * script, the reader page and the tests.
 */

export type VideoInfo =
  | { provider: "brightcove"; account: string; player: string; id: string; paras: [number, number][] | null }
  | { provider: "mp4"; src: string; paras: [number, number][] | null };

/** texts.video (jsonb) → VideoInfo, or null when it is not a usable video. */
export function asVideo(v: unknown): VideoInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const paras = Array.isArray(o.paras) ? (o.paras as [number, number][]) : null;
  if (o.provider === "brightcove" && typeof o.account === "string" && typeof o.player === "string" && typeof o.id === "string")
    return { provider: "brightcove", account: o.account, player: o.player, id: o.id, paras };
  if (o.provider === "mp4" && typeof o.src === "string" && /^https:\/\//.test(o.src)) return { provider: "mp4", src: o.src, paras };
  return null;
}

export interface Cue {
  s: number;
  e: number;
  text: string;
}

const time = (t: string) => {
  const p = t.trim().replace(",", ".").split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

/** WebVTT → cues with plain text (tags, speaker dashes and line breaks removed). */
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r/g, "").replace(/^﻿/, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].split("-->");
    const text = lines
      .slice(at + 1)
      .map((l) => l.replace(/^\s*[-–]\s*/, "")) // a speaker change at the start of a line
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // subtitle hyphens: «-Jonas? -Jeg», «som sier - at»; an en dash (–) is real punctuation and stays
      .replace(/(^|\s)-\s*(?=[\p{L}\d«"])/gu, "$1")
      .replace(/\s-\s/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s-$/, "") // a sentence that goes on in the next cue: «som sier -» / «at nå …»
      .trim();
    if (text) cues.push({ s: time(a), e: time(b.trim().split(/\s/)[0]), text });
  }
  return cues;
}

/**
 * Cues → transcript paragraphs with their times: a paragraph closes at the end of a sentence once it is long
 * enough, at a pause in speech, or when it gets long. Short paragraphs keep the highlight close to the speech.
 */
export function cuesToParagraphs(cues: Cue[], opts = { min: 140, max: 380, pause: 1.6 }): { paras: string[]; times: [number, number][] } {
  const paras: string[] = [];
  const times: [number, number][] = [];
  let cur: Cue[] = [];
  const flush = () => {
    if (!cur.length) return;
    paras.push(cur.map((c) => c.text).join(" "));
    times.push([cur[0].s, cur[cur.length - 1].e]);
    cur = [];
  };
  cues.forEach((c, i) => {
    cur.push(c);
    const text = cur.map((x) => x.text).join(" ");
    const next = cues[i + 1];
    const sentenceEnd = /[.!?…]["»”)]?$/.test(c.text);
    const pause = next ? next.s - c.e >= opts.pause : true;
    if ((sentenceEnd && (text.length >= opts.min || (pause && text.length >= 40))) || text.length >= opts.max) flush();
  });
  flush();
  return { paras, times };
}

/** The paragraph being spoken at time t (the last one that has started), or null before the first. */
export function activeParagraph(times: [number, number][], t: number): number | null {
  let lo = 0;
  let hi = times.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid][0] <= t + 0.15) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/**
 * NDLA's Norwegian licence names → Creative Commons codes. Only CC licences are usable here; «Opphavsrett»
 * (all rights reserved, e.g. NRK clips) is not.
 */
export function ndlaLicense(name: string | undefined): string | null {
  if (!name || !/^Navngivelse/i.test(name.trim())) return null;
  const parts = ["BY"];
  if (/Ikkekommersiell/i.test(name)) parts.push("NC");
  if (/Del på samme vilkår/i.test(name)) parts.push("SA");
  if (/Ingen Bearbeidelse/i.test(name)) parts.push("ND");
  return `CC ${parts.join("-")}`;
}
