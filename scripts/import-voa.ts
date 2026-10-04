/**
 * Import VOA Learning English articles with their recordings ("listen and read").
 * VOA's own material is US-government work in the public domain; articles credited to wire services
 * (AP, Reuters, AFP) are skipped. VOA stopped publishing in March 2025, so the MP3 is copied into the
 * public "media" bucket instead of linking to VOA's servers.
 *
 *   npm run import:voa                # dry run
 *   npm run import:voa -- --save      # import (needs migration 0010)
 *   npm run import:voa -- --per=25    # articles per section (default 15)
 */
import { parse } from "node-html-parser";
import { admin, insertText } from "./lib";

const BASE = "https://learningenglish.voanews.com";
const UA = "Sprakhylla/0.1 (personal language-learning app)";
// VOA's own series; most short news items are adapted from wire services and get skipped below.
const SECTIONS = [
  { id: 952, name: "Read, Listen & Learn", level: "A2" },
  { id: 987, name: "Words and Their Stories", level: "A2" },
  { id: 4456, name: "Everyday Grammar", level: "B1" },
  { id: 5535, name: "Ask a Teacher", level: "A2" },
  { id: 3521, name: "As It Is", level: "B1" },
  { id: 1579, name: "Science & Technology", level: "B1" },
  { id: 986, name: "Arts & Culture", level: "B1" },
  { id: 955, name: "Health & Lifestyle", level: "B1" },
];
const WIRE = /\b(Associated Press|Reuters|AFP|Agence France-Presse|the AP\b|AP reported)/i;
/** Current US and world politics, elections and wars are skipped (only Norwegian politics belongs in the app). History stays. */
const POLITICS = /\b(Trump|Biden|Harris|Obama|Putin|Netanyahu|Zelensky|election|elections|electoral|Congress|Senate|senator|Democrats?|Republicans?|White House|campaign|felony|impeach\w*|Israel\w*|Gaza|Hamas|Rafah|Hezbollah|Ukrain\w*|Russia\w*|missile|weapons?|troops|military|sanctions?|tariffs?|border|migrants?)\b/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

interface Article {
  url: string;
  title: string;
  date: string;
  body: string;
  mp3: string;
  words: number;
}

async function article(url: string): Promise<Article | { skip: string }> {
  const html = await get(url);
  const doc = parse(html);
  const title = doc.querySelector("h1")?.text.trim() ?? "";
  const date = doc.querySelector("time")?.getAttribute("datetime")?.slice(0, 10) ?? "";
  const mp3 = [...new Set(html.match(/https:\/\/voa-audio\.voanews\.eu\/[^"'&\s]+?\.mp3/g) ?? [])].find((u) => !u.endsWith("_hq.mp3"));
  if (!mp3) return { skip: "no audio" };
  const paras: string[] = [];
  for (const p of doc.querySelectorAll(".wsw p, .wsw h2, .wsw h3")) {
    const t = p.text.replace(/\s+/g, " ").trim();
    if (!t || /No media source currently available|^_{3,}/.test(t)) continue;
    if (/^Words in This Story$/i.test(t) || /^_+\s*$/.test(t)) break; // the glossary at the end
    paras.push(p.tagName === "P" ? t : `## ${t}`);
  }
  const body = paras.join("\n\n");
  if (WIRE.test(body) || WIRE.test(doc.querySelector(".c-author, .author")?.text ?? "")) return { skip: "wire-service content" };
  const political = (title.match(POLITICS) ?? body.slice(0, 1500).match(POLITICS))?.[0];
  if (political) return { skip: `politics («${political}»)` };
  const words = (body.match(/\p{L}+/gu) ?? []).length;
  if (words < 150) return { skip: `too short (${words} words)` };
  return { url, title, date, body, mp3, words };
}

async function storeAudio(mp3: string, key: string) {
  const db = admin();
  const path = `voa/${key}.mp3`;
  const pub = db.storage.from("media").getPublicUrl(path).data.publicUrl;
  const head = await fetch(pub, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return pub;
  const audio = Buffer.from(await (await fetch(mp3, { headers: { "user-agent": UA } })).arrayBuffer());
  const up = await db.storage.from("media").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message} (run migration 0010 first)`);
  return pub;
}

async function main() {
  const save = process.argv.includes("--save");
  const per = Number(process.argv.find((a) => a.startsWith("--per="))?.slice(6) ?? 15);
  let total = 0;
  const done = new Set<string>(); // an article listed in two sections is imported once
  for (const sec of SECTIONS) {
    let taken = 0;
    const seen = new Set<string>();
    for (let page = 0; page < 30 && taken < per; page++) {
      const list = await get(`${BASE}/z/${sec.id}${page ? `?p=${page}` : ""}`);
      const links = [...new Set(list.match(/\/a\/[^"]+\.html/g) ?? [])];
      if (!links.length) break;
      for (const link of links) {
        if (taken >= per) break;
        if (seen.has(link) || done.has(link)) continue;
        seen.add(link);
        done.add(link);
        await sleep(400);
        const a = await article(BASE + link).catch((e) => ({ skip: String(e) }));
        if ("skip" in a) {
          console.log(`  skip ${link.slice(0, 70)}: ${a.skip}`);
          continue;
        }
        taken++;
        total++;
        console.log(`${save ? "save" : "would save"} ${sec.name} | ${a.date} | ${a.title} | ${a.words} words`);
        if (!save) continue;
        const key = link.match(/(\d+)\.html$/)?.[1] ?? String(Date.now());
        const audioUrl = await storeAudio(a.mp3, key);
        const { id } = await insertText({
          lang: "en",
          title: a.title,
          author: "VOA Learning English",
          year: a.date.slice(0, 4),
          kind: "news",
          author_note: `Новости «Голоса Америки» для изучающих английский (${sec.name}), ${a.date}. Простой язык, медленное чтение диктором.`,
          body: a.body,
          source_url: a.url,
          license: "public domain (VOA Learning English, US government work)",
          est_level: sec.level,
        });
        // also fills the recording in for an article saved earlier without it
        const { error } = await admin().from("texts").update({ audio_url: audioUrl }).eq("id", id).is("audio_url", null);
        if (error) throw error;
      }
    }
  }
  console.log(`${total} articles ${save ? "imported" : "would be imported (dry run; add --save)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
