"use client";
/** Playback (server TTS with browser-voice fallback) and microphone recording helpers. */
import { useCallback, useRef, useState } from "react";

let current: HTMLAudioElement | null = null;
// Bumped by stopAudio(): a playback started earlier sees the change and ends quietly.
let generation = 0;

function browserSpeak(text: string, lang: "no" | "en", rate: number, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) return onEnd?.();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "no" ? "nb-NO" : "en-GB";
  u.rate = rate;
  const voices = speechSynthesis.getVoices();
  const v = lang === "no" ? voices.find((x) => /^(nb|no|nn)/i.test(x.lang)) : voices.find((x) => /^en-GB/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

export function stopAudio() {
  generation++;
  current?.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** Server audio for a text (cached per page view, so prefetching the next paragraph is free later). */
const urlCache = new Map<string, Promise<string | null>>();
export function ttsUrl(text: string, lang: "no" | "en", rate?: number): Promise<string | null> {
  const key = `${lang}|${rate ?? ""}|${text}`;
  let p = urlCache.get(key);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang, rate }) })
      .then((r) => r.json())
      .then((d) => (d.url as string | null) ?? null)
      .catch(() => null);
    urlCache.set(key, p);
  }
  return p;
}

/** Play a known URL, or ask the server for one; fall back to the browser's voice. */
export async function speak(text: string, lang: "no" | "en", opts: { url?: string | null; rate?: number } = {}) {
  void speakToEnd(text, lang, opts);
}

/** Like speak(), but resolves when the audio has finished: true, or false when it was stopped. */
export async function speakToEnd(text: string, lang: "no" | "en", opts: { url?: string | null; rate?: number } = {}): Promise<boolean> {
  stopAudio();
  const gen = generation;
  const url = opts.url !== undefined ? opts.url : await ttsUrl(text, lang, opts.rate);
  if (gen !== generation) return false;
  return new Promise<boolean>((resolve) => {
    const done = () => resolve(gen === generation);
    if (url) {
      const a = new Audio(url);
      current = a;
      a.onended = done;
      a.onpause = () => gen !== generation && resolve(false);
      a.onerror = () => browserSpeak(text, lang, opts.rate ?? 0.9, done);
      a.play().catch(() => browserSpeak(text, lang, opts.rate ?? 0.9, done));
    } else browserSpeak(text, lang, opts.rate ?? 0.9, done);
  });
}

export interface Recording {
  blob: Blob;
  durationMs: number;
}

/** Push-to-talk recorder. start() asks for the microphone the first time. level (0–1) and seconds show it is listening. */
export function useRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const meter = useRef<{ ctx: AudioContext; raf: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const stopMeter = useCallback(() => {
    if (!meter.current) return;
    cancelAnimationFrame(meter.current.raf);
    clearInterval(meter.current.timer);
    meter.current.ctx.close().catch(() => {});
    meter.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        if (!meter.current) return;
        if (t - last > 80) {
          last = t;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4)); // speech sits around 0.05–0.25 RMS
        }
        meter.current.raf = requestAnimationFrame(tick);
      };
      setSeconds(0);
      meter.current = { ctx, raf: requestAnimationFrame(tick), timer: setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250) };
    } catch {
      /* no meter in this browser: recording still works */
    }
  }, []);

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
      startMeter(stream);
      setRecording(true);
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера (значок замка рядом с адресом).");
    }
  }, [startMeter]);

  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const r = rec.current;
        if (!r || r.state === "inactive") return resolve(null);
        stopMeter();
        r.onstop = () => {
          r.stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          const durationMs = Date.now() - startedAt.current;
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          resolve(durationMs < 400 || blob.size < 1000 ? null : { blob, durationMs });
        };
        r.stop();
      }),
    [stopMeter],
  );

  return { start, stop, recording, error, level, seconds };
}

export async function sendForTranscript(rec: Recording, lang: "no" | "en", purpose: string): Promise<string> {
  return (await transcribeRecording(rec, lang, purpose)).text;
}

/** Speech to text on the server; also says which provider recognised it (for the conversation log). */
export async function transcribeRecording(rec: Recording, lang: "no" | "en", purpose: string): Promise<{ text: string; provider: string }> {
  const fd = new FormData();
  fd.append("audio", rec.blob, "speech");
  fd.append("lang", lang);
  fd.append("durationMs", String(rec.durationMs));
  fd.append("purpose", purpose);
  const r = await fetch("/api/stt", { method: "POST", body: fd });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка распознавания");
  return { text: data.text as string, provider: (data.provider as string) ?? "server" };
}
