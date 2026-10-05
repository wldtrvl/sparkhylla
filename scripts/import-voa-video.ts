/**
 * English videos with real speakers from VOA Learning English (US government work, public domain). VOA's video
 * pages have no transcript or subtitles, so Gemini transcribes the soundtrack word for word with times (the
 * transcript is marked as made automatically); the video plays from VOA's own MP4.
 *
 *   npm run import:voa-video                    # dry run: lists the videos
 *   npm run import:voa-video -- --save          # transcribe and add new videos (existing ones are skipped first)
 *   npm run import:voa-video -- --per=5 --save  # videos per series (default 30)
 *   npm run import:voa-video -- --series=6324   # one series
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { execute, type AttemptLog } from "@/lib/ai/execute";
import { videoTranscribePrompt, VideoTranscriptSchema } from "@/lib/ai/prompts";
import { configuredRoutes, planAttempts } from "@/lib/ai/routing";
import { chunksFromSilences, parseSilences } from "@/lib/video";
import { admin, insertText, newTexts, plural } from "./lib";

const BASE = "https://learningenglish.voanews.com";
const UA = "Sprakhylla/0.1 (personal language-learning app)";
const SERIES = [
  { id: 6324, name: "Let's Learn English, Level 1", level: "A1", note: "Сериал для начинающих: Анна переезжает в Вашингтон, знакомится с людьми и учится жить в большом городе. Простые разговоры на американском английском." },
  { id: 6325, name: "Let's Learn English, Level 2", level: "A2", note: "Продолжение сериала про Анну: работа, друзья и повседневная жизнь в Вашингтоне. Разговоры чуть сложнее, чем в первом уровне." },
  { id: 3619, name: "English in a Minute", level: "A2", note: "Одна минута — одно популярное выражение американского английского, с примерами из жизни." },
  { id: 3620, name: "News Words", level: "B1", note: "Короткое видео об одном слове, которое часто звучит в новостях." },
  { id: 4716, name: "Everyday Grammar TV", level: "B1", note: "Короткие уроки грамматики с живыми примерами на улицах американских городов." },
];
// current US and world politics and wars are left out
const POLITICS = /\b(Trump|Biden|Harris|Putin|Netanyahu|Zelensky|election|Congress|Senate|Democrats?|Republicans?|White House|Gaza|Hamas|Ukrain\w*|Russia\w*|missile|troops|military|sanctions?|tariffs?)\b/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let spent = 0;
const logs: Promise<unknown>[] = [];

async function get(url: string) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

function logAttempt(a: AttemptLog) {
  spent += a.costUsd ?? 0;
  logs.push(
    Promise.resolve(
      admin().from("llm_calls").insert({
        user_id: null, task: a.task, prompt_id: a.promptId, prompt_version: a.promptVersion, provider: a.route.provider, model: a.route.model,
        variant: a.variant, input_tokens: a.inputTokens, output_tokens: a.outputTokens, cost_usd: a.costUsd, latency_ms: a.latencyMs, ok: a.ok,
        error: a.error ?? null, attempt: a.attempt,
      }),
    ),
  );
}

/** The video page: title, date, MP4 sources by height (from the player's data-sources). */
async function videoPage(url: string) {
  const html = await get(url);
  const doc = parse(html);
  // the <h1> holds the series name; the episode is in <title> («English in a Minute: A Clean Slate»)
  const title = (doc.querySelector("title")?.text ?? "").replace(/\s+-\s+VOA.*$/, "").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const date = doc.querySelector("time")?.getAttribute("datetime")?.slice(0, 10) ?? "";
  const raw = html.match(/data-sources="([^"]+)"/)?.[1];
  const sources: { Src: string; DataInfo: string; Type: string }[] = raw ? JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) : [];
  const mp4 = (h: string) => sources.find((s) => s.Type === "video/mp4" && s.DataInfo === h)?.Src.replace(/\?.*$/, "").replace("voa-video-ns.akamaized.net", "voa-video.voanews.eu");
  return { title, date, play: mp4("480p") ?? mp4("360p") ?? mp4("720p"), small: mp4("240p") ?? mp4("360p") ?? mp4("480p") };
}

/**
 * The soundtrack is cut at pauses (ffmpeg silencedetect) into pieces of about 10 s, and Gemini transcribes each
 * piece. Each piece with speech becomes one paragraph whose start and end are measured from the audio: asking a
 * model for timestamps over a whole video drifted by half a minute.
 */
async function transcribe(mp4: string, title: string) {
  const dir = mkdtempSync(join(tmpdir(), "voa-"));
  try {
    const video = join(dir, "v.mp4");
    const audio = join(dir, "a.wav");
    writeFileSync(video, Buffer.from(await (await fetch(mp4, { headers: { "user-agent": UA } })).arrayBuffer()));
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", audio]);
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]).toString().trim());
    // silencedetect reports on stderr
    const log = spawnSync("ffmpeg", ["-hide_banner", "-i", audio, "-af", "silencedetect=noise=-32dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const chunks = chunksFromSilences(parseSilences(log), seconds);
    const texts: string[] = new Array(chunks.length).fill("");
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < chunks.length) {
          const i = next++;
          const [s, e] = chunks[i];
          const clip = join(dir, `c${i}.mp3`);
          execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(Math.max(0, s - 0.15)), "-to", String(Math.min(seconds, e + 0.15)), "-i", audio, "-ac", "1", "-b:a", "48k", clip]);
          const r = await execute({
            task: "video_transcribe",
            prompt: videoTranscribePrompt({ lang: "en", audio: { mimeType: "audio/mpeg", data: readFileSync(clip).toString("base64") }, title }),
            schema: VideoTranscriptSchema,
            attempts: planAttempts(configuredRoutes("video_transcribe")),
            maxTokens: 1500,
            timeoutMs: 120_000,
            lowLatency: true,
            onAttempt: logAttempt,
          });
          texts[i] = r.data.text.replace(/\s+/g, " ").trim();
        }
      }),
    );
    const keep = texts.map((t, i) => ({ t, time: chunks[i] })).filter((x) => /\p{L}/u.test(x.t));
    return { seconds, paras: keep.map((x) => x.t), times: keep.map((x) => x.time) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const save = process.argv.includes("--save");
  const per = Number(process.argv.find((a) => a.startsWith("--per="))?.slice(6) ?? 30);
  const only = process.argv.find((a) => a.startsWith("--series="))?.slice(9).split(",").map(Number);
  const db = admin();
  const added = newTexts();
  const done = new Set<string>();
  let count = 0;
  for (const sec of SERIES.filter((x) => !only || only.includes(x.id))) {
    let taken = 0;
    for (let page = 0; page < 20 && taken < per; page++) {
      const list = await get(`${BASE}/z/${sec.id}${page ? `?p=${page}` : ""}`);
      const links = [...new Set(list.match(/\/a\/[^"]+\.html/g) ?? [])];
      if (!links.length) break;
      for (const link of links) {
        if (taken >= per || done.has(link)) continue;
        done.add(link);
        await sleep(300);
        const v = await videoPage(BASE + link).catch(() => null);
        if (!v?.title || !v.play || !v.small) continue;
        if (POLITICS.test(v.title)) {
          console.log(`  skip ${v.title}: politics`);
          continue;
        }
        taken++;
        // already in the library: skip before paying for a transcript
        const { data: existing } = await db.from("texts").select("id").eq("title", v.title).eq("author", "VOA Learning English").maybeSingle();
        if (existing) {
          console.log(`  kept ${v.title}: already in the library`);
          continue;
        }
        count++;
        console.log(`${save ? "transcribe" : "would transcribe"} | ${sec.name} | ${v.date} | ${v.title}`);
        if (!save) continue;
        const t = await transcribe(v.small, v.title).catch((e) => (console.log(`    failed: ${e instanceof Error ? e.message.slice(0, 160) : e}`), null));
        if (!t || (t.paras.join(" ").match(/\p{L}+/gu) ?? []).length < 40) {
          console.log("    skipped: too little speech");
          continue;
        }
        const { paras, times } = t;
        const body = paras.join("\n\n");
        if (POLITICS.test(body.slice(0, 2000))) {
          console.log("    skipped: politics");
          continue;
        }
        const r = await insertText({
          lang: "en",
          title: v.title,
          author: "VOA Learning English",
          year: v.date.slice(0, 4),
          kind: "video",
          author_note: `«Голос Америки» для изучающих английский — ${sec.name}. ${sec.note}`,
          body,
          source_url: BASE + link,
          license: "public domain (VOA Learning English, US government work); transcript made automatically",
          est_level: sec.level,
        });
        added.add(r.status, sec.name);
        const q = db.from("texts").update({ video: { provider: "mp4", src: v.play, paras: times } }).eq("id", r.id);
        const { error } = await (r.status === "kept" ? q.is("video", null) : q);
        if (error) throw error;
        console.log(`    saved: ${Math.round(t.seconds)} s, ${paras.length} paragraphs, ${(body.match(/\p{L}+/gu) ?? []).length} words`);
      }
    }
  }
  await Promise.all(logs);
  await added.announce({ title: (n) => `${n} ${plural(n, ["новое видео", "новых видео", "новых видео"])} на английском`, author: (a) => a, link: "/library?kind=video" });
  console.log(`\n${count} videos ${save ? "processed" : "would be transcribed (dry run; add --save)"}; AI cost $${spent.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
