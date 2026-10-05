/**
 * Choosing the browser's voice when no server TTS is configured. Taking the first en-US voice is a trap:
 * on macOS and iOS that is «Albert», and the list goes on with joke and robotic voices (Bad News, Bubbles,
 * Zarvox, Eloquence's Grandpa…). Skip those and prefer natural voices.
 */
import { splitSentences } from "@/lib/text-format";

const POOR =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Jester|Junior|Kathy|Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
const NATURAL = /(premium|enhanced|natural|neural)/i;
const GOOD = /^(Samantha|Ava|Allison|Susan|Zoe|Evan|Nathan|Tom|Nicky|Google US English|Microsoft (Aria|Jenny|Guy|Ava|Andrew|Emma|Brian)|Nora|Microsoft (Pernille|Finn|Iselin)|Google norsk)/i;

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

export function pickVoice<T extends VoiceLike>(voices: T[], lang: "no" | "en"): T | null {
  const ofLang = voices.filter((v) => (lang === "no" ? /^(nb|no|nn)\b/i : /^en\b/i).test(v.lang.replace("_", "-")));
  let best: T | null = null;
  let bestScore = -1;
  for (const v of ofLang) {
    if (POOR.test(v.name)) continue;
    let s = 0;
    if (NATURAL.test(v.name)) s += 4;
    if (GOOD.test(v.name)) s += 2;
    if (lang === "en" && /^en-US/i.test(v.lang.replace("_", "-"))) s += 1; // American English: clearer for her
    if (lang === "no" && /^nb/i.test(v.lang)) s += 1;
    if (s > bestScore) [best, bestScore] = [v, s];
  }
  return best;
}

/**
 * Text split for the browser voice: one utterance per sentence, long sentences cut at commas. Chrome's online
 * Google voices (the good ones on Windows) stop after about 15 seconds of one utterance.
 */
export function speechChunks(text: string, max = 200): string[] {
  const out: string[] = [];
  for (const s of splitSentences(text.replace(/\s+/g, " ").trim())) {
    if (s.length <= max) {
      out.push(s);
      continue;
    }
    let cur = "";
    for (const piece of s.split(/(?<=[,;:])\s+/)) {
      if (cur && (cur + " " + piece).length > max) {
        out.push(cur);
        cur = piece;
      } else cur = cur ? `${cur} ${piece}` : piece;
    }
    if (cur) out.push(cur);
  }
  return out.filter(Boolean);
}
