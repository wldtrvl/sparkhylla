import { NextResponse } from "next/server";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { sttAvailable, transcribe } from "@/lib/speech/stt";

const MAX_BYTES = 8 * 1024 * 1024;

/** multipart: audio (webm/ogg/mp4), lang, durationMs, purpose */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  if (!sttAvailable()) return NextResponse.json({ error: "Распознавание речи не настроено на сервере." }, { status: 503 });
  const form = await req.formData();
  const audio = form.get("audio");
  const lang = form.get("lang") === "en" ? "en" : "no";
  const durationSec = Math.max(0, Number(form.get("durationMs") ?? 0) / 1000);
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "Запись пустая. Попробуйте ещё раз." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Запись слишком длинная." }, { status: 413 });
  try {
    const t = await transcribe(audio, lang, s.user.id, durationSec);
    logEvent(s, "speech.transcribed", { purpose: String(form.get("purpose") ?? ""), provider: t.provider, seconds: durationSec, chars: t.text.length });
    return NextResponse.json({ text: t.text, provider: t.provider });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Не удалось распознать речь. Попробуйте ещё раз." }, { status: 502 });
  }
}
