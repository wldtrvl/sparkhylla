"use client";
/** Playback (server TTS with browser-voice fallback) and microphone recording helpers. */
import { useCallback, useRef, useState } from "react";

let current: HTMLAudioElement | null = null;

function browserSpeak(text: string, lang: "no" | "en", rate: number) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "no" ? "nb-NO" : "en-GB";
  u.rate = rate;
  const voices = speechSynthesis.getVoices();
  const v = lang === "no" ? voices.find((x) => /^(nb|no|nn)/i.test(x.lang)) : voices.find((x) => /^en-GB/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

export function stopAudio() {
  current?.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** Play a known URL, or ask the server for one; fall back to the browser's voice. */
export async function speak(text: string, lang: "no" | "en", opts: { url?: string | null; rate?: number } = {}) {
  stopAudio();
  let url = opts.url ?? null;
  if (url === null && opts.url === undefined) {
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang, rate: opts.rate }) });
      url = (await r.json()).url ?? null;
    } catch {
      url = null;
    }
  }
  if (url) {
    current = new Audio(url);
    try {
      await current.play();
      return;
    } catch {
      /* fall through to browser voice */
    }
  }
  browserSpeak(text, lang, opts.rate ?? 0.9);
}

export interface Recording {
  blob: Blob;
  durationMs: number;
}

/** Push-to-talk recorder. start() asks for the microphone the first time. */
export function useRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    stopAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start();
      rec.current = r;
      startedAt.current = Date.now();
      setRecording(true);
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера (значок замка рядом с адресом).");
    }
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const r = rec.current;
        if (!r || r.state === "inactive") return resolve(null);
        r.onstop = () => {
          r.stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          const durationMs = Date.now() - startedAt.current;
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          resolve(durationMs < 400 || blob.size < 1000 ? null : { blob, durationMs });
        };
        r.stop();
      }),
    [],
  );

  return { start, stop, recording, error };
}

export async function sendForTranscript(rec: Recording, lang: "no" | "en", purpose: string): Promise<string> {
  const fd = new FormData();
  fd.append("audio", rec.blob, "speech");
  fd.append("lang", lang);
  fd.append("durationMs", String(rec.durationMs));
  fd.append("purpose", purpose);
  const r = await fetch("/api/stt", { method: "POST", body: fd });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка распознавания");
  return data.text as string;
}
