import "server-only";
import { serverEnv } from "@/lib/env";
import { geminiThinking } from "@/lib/ai/providers";
import { adminClient } from "@/lib/supabase/admin";

export interface Transcript {
  text: string;
  provider: string;
}

type Lang = "no" | "en";

async function openaiStt(audio: Blob, lang: Lang): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "speech.webm");
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", lang === "no" ? "no" : "en");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${serverEnv.openaiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return String(data.text ?? "").trim();
}

async function geminiStt(audio: Blob, lang: Lang): Promise<string> {
  const b64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const model = serverEnv.geminiSttModel();
  const thinking = geminiThinking(model);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": serverEnv.googleKey() },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: audio.type || "audio/webm", data: b64 } },
            {
              text:
                `Transcribe this ${lang === "no" ? "Norwegian (Bokmål)" : "English"} speech by a language learner VERBATIM, ` +
                `keeping her grammar mistakes exactly as spoken. If she switches to Russian or Ukrainian, transcribe that too in Cyrillic. ` +
                `Output only the transcript.`,
            },
          ],
        },
      ],
      generationConfig: thinking ? { thinkingConfig: thinking } : {},
    }),
  });
  if (!res.ok) throw new Error(`Gemini STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
}

const STT: Record<string, { available: () => boolean; run: (a: Blob, l: Lang) => Promise<string>; model: string; perMinute: number | null }> = {
  openai: { available: () => !!serverEnv.openaiKey(), run: openaiStt, model: "gpt-4o-mini-transcribe", perMinute: 0.003 },
  google: { available: () => !!serverEnv.googleKey(), run: geminiStt, model: "gemini", perMinute: null },
};

export function sttAvailable(): boolean {
  return serverEnv.sttProviders().some((p) => STT[p]?.available());
}

/** Transcribe learner speech. Tries providers in STT_PROVIDERS order; logs each attempt. */
export async function transcribe(audio: Blob, lang: Lang, userId: string, durationSec: number): Promise<Transcript> {
  let lastErr: unknown = new Error("No speech-to-text provider configured");
  for (const name of serverEnv.sttProviders()) {
    const p = STT[name];
    if (!p?.available()) continue;
    const started = Date.now();
    try {
      const text = await p.run(audio, lang);
      await adminClient().from("speech_calls").insert({
        user_id: userId, kind: "stt", provider: name, model: name === "google" ? serverEnv.geminiSttModel() : p.model, lang, units: durationSec,
        cost_usd: p.perMinute != null ? (durationSec / 60) * p.perMinute : null, latency_ms: Date.now() - started, ok: true,
      });
      return { text, provider: name };
    } catch (e) {
      lastErr = e;
      await adminClient().from("speech_calls").insert({
        user_id: userId, kind: "stt", provider: name, model: name === "google" ? serverEnv.geminiSttModel() : p.model, lang, units: durationSec,
        latency_ms: Date.now() - started, ok: false, error: e instanceof Error ? e.message.slice(0, 400) : String(e),
      });
    }
  }
  throw lastErr;
}
