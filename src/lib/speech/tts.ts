import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { insertLater } from "@/lib/log";
import { adminClient } from "@/lib/supabase/admin";

type Lang = "no" | "en";

/** Synthesised audio is cached in the public `tts` bucket by a hash of provider+voice+rate+text. */
async function googleTts(text: string, lang: Lang, rate: number): Promise<Buffer> {
  const name = lang === "no" ? serverEnv.ttsVoiceNo() : serverEnv.ttsVoiceEn();
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(serverEnv.googleTtsKey())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang === "no" ? "nb-NO" : "en-GB", ...(name ? { name } : { ssmlGender: "FEMALE" }) },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate },
    }),
  });
  if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Buffer.from(data.audioContent, "base64");
}

async function openaiTts(text: string, lang: Lang, rate: number): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serverEnv.openaiKey()}` },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      speed: rate,
      instructions: lang === "no" ? "Speak natural Norwegian Bokmål (Eastern Norwegian), clearly and calmly." : "Speak clear British English, calmly.",
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

const TTS: Record<string, { available: () => boolean; run: (t: string, l: Lang, r: number) => Promise<Buffer>; perMillionChars: number | null }> = {
  google: { available: () => !!serverEnv.googleTtsKey(), run: googleTts, perMillionChars: 4 },
  openai: { available: () => !!serverEnv.openaiKey(), run: openaiTts, perMillionChars: null },
};

/** Returns a public URL to an MP3, or null when no TTS provider is configured (the browser voice is used then). */
export async function synthesize(text: string, lang: Lang, rate: number, userId: string | null): Promise<string | null> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) return null;
  const admin = adminClient();
  for (const name of serverEnv.ttsProviders()) {
    const p = TTS[name];
    if (!p?.available()) continue;
    const voice = lang === "no" ? serverEnv.ttsVoiceNo() : serverEnv.ttsVoiceEn();
    const key = createHash("sha256").update([name, voice, lang, rate.toFixed(2), clean].join("|")).digest("hex");
    const path = `${lang}/${key}.mp3`;
    const publicUrl = admin.storage.from("tts").getPublicUrl(path).data.publicUrl;
    const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
    if (head?.ok) {
      insertLater("speech_calls", { user_id: userId, kind: "tts", provider: name, lang, units: clean.length, cost_usd: 0, ok: true, cached: true });
      return publicUrl;
    }
    const started = Date.now();
    try {
      const mp3 = await p.run(clean, lang, rate);
      const up = await admin.storage.from("tts").upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      insertLater("speech_calls", {
        user_id: userId, kind: "tts", provider: name, lang, units: clean.length,
        cost_usd: p.perMillionChars != null ? (clean.length / 1e6) * p.perMillionChars : null, latency_ms: Date.now() - started, ok: true,
      });
      return publicUrl;
    } catch (e) {
      insertLater("speech_calls", {
        user_id: userId, kind: "tts", provider: name, lang, units: clean.length, latency_ms: Date.now() - started, ok: false,
        error: e instanceof Error ? e.message.slice(0, 400) : String(e),
      });
    }
  }
  return null;
}
