/**
 * Norwegian videos with real speakers from NDLA (the state-funded open learning platform): videos under a
 * Creative Commons licence that have bokmål subtitles become library items of kind «video». The subtitles
 * become the transcript (the text body) and say when each paragraph is spoken; the video plays in NDLA's own
 * Brightcove player. Videos marked «Opphavsrett» (e.g. NRK clips) are never imported.
 *
 *   npm run import:ndla              # dry run
 *   npm run import:ndla -- --save    # adds new videos; existing ones are kept
 *   npm run import:ndla -- --per=10  # articles per topic (default 20)
 *   npm run import:ndla -- --topics=nyheter,helse
 */
import { cuesToParagraphs, ndlaLicense, parseVtt } from "@/lib/video";
import { admin, insertText, newTexts, plural } from "./lib";

const UA = "Sprakhylla/0.1 (personal language-learning app)";
// topics for an adult living in Norway; the Russian label goes into the note under the title
const TOPICS: [string, string][] = [
  ["arbeidsliv", "работа"],
  ["jobbintervju", "работа"],
  ["helse", "здоровье"],
  ["kosthold", "здоровье"],
  ["psykisk helse", "здоровье"],
  ["familie", "семья"],
  ["oppvekst", "семья"],
  ["eldreomsorg", "забота о пожилых"],
  ["velferdsstaten", "общество"],
  ["demokrati", "общество"],
  ["stortingsvalg", "общество"],
  ["privatøkonomi", "деньги"],
  ["matkultur", "еда"],
  ["mat", "еда"],
  ["friluftsliv", "природа"],
  ["natur", "природа"],
  ["klima", "природа"],
  ["tradisjoner", "культура"],
  ["kultur", "культура"],
  ["samisk", "культура"],
  ["norsk historie", "история"],
  ["dialekter", "язык"],
  ["språk", "язык"],
  ["nyheter", "новости и СМИ"],
  ["journalistikk", "новости и СМИ"],
  ["kommunikasjon", "общение"],
  ["reiseliv", "путешествия"],
];
// current foreign politics and wars are left out (Norwegian politics is fine)
const FOREIGN_POLITICS = /\b(Trump|Biden|Putin|Ukraina|Russland|Israel|Gaza|Hamas|Palestina|Hizbollah|Taliban|IS-krigere)\b/i;
const NYNORSK = /\b(ikkje|eg|kva|korleis|berre|noko|frå|heile|kvar|meir|dei|vore|gjekk)\b/gi;
const BOKMAL = /\b(ikke|jeg|hva|hvordan|bare|noe|fra|hele|hver|mer|de|vært|gikk)\b/gi;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { "user-agent": UA, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<T>;
}

// the policy key is public: NDLA's player uses it in every browser that plays an NDLA video
const keys = new Map<string, string>();
async function policyKey(account: string, player: string) {
  const k = `${account}/${player}`;
  if (!keys.has(k)) {
    const js = await (await fetch(`https://players.brightcove.net/${account}/${player}_default/index.min.js`, { headers: { "user-agent": UA } })).text();
    const m = js.match(/policyKey:"([^"]+)"/);
    if (!m) throw new Error(`no policy key for player ${k}`);
    keys.set(k, m[1]);
  }
  return keys.get(k)!;
}

interface Bc {
  id: string;
  name: string;
  duration: number;
  published_at?: string;
  custom_fields?: { license?: string; licenseinfo?: string };
  text_tracks?: { kind: string; srclang: string | null; src: string }[];
}

async function main() {
  const save = process.argv.includes("--save");
  const per = Number(process.argv.find((a) => a.startsWith("--per="))?.slice(6) ?? 20);
  const seen = new Set<string>();
  const added = newTexts();
  let count = 0;
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

  const only = process.argv.find((a) => a.startsWith("--topics="))?.slice(9).split(",");
  for (const [query, topicRu] of TOPICS.filter(([q]) => !only || only.includes(q))) {
    const search = await json<{ results: { id: number }[] }>(`https://api.ndla.no/search-api/v1/search/?query=${encodeURIComponent(query)}&page-size=${per}&language=nb&traits=VIDEO`);
    for (const { id: articleId } of search.results) {
      const art = await json<{ content?: { content: string } }>(`https://api.ndla.no/article-api/v2/articles/${articleId}?language=nb`).catch(() => null);
      for (const m of (art?.content?.content ?? "").matchAll(/<ndlaembed[^>]*data-resource="brightcove"[^>]*>/g)) {
        const attr = (n: string) => m[0].match(new RegExp(`data-${n}="([^"]*)"`))?.[1] ?? "";
        const [videoId, account, player] = [attr("videoid"), attr("account"), attr("player")];
        if (!videoId || !account || !player || seen.has(videoId)) continue;
        seen.add(videoId);
        await sleep(150);
        const v = await json<Bc>(`https://edge.api.brightcove.com/playback/v1/accounts/${account}/videos/${videoId}`, { accept: `application/json;pk=${await policyKey(account, player)}` }).catch(() => null);
        if (!v?.id) {
          skip("not playable");
          continue;
        }
        const license = ndlaLicense(v.custom_fields?.license);
        if (!license) {
          skip(`licence «${v.custom_fields?.license ?? "none"}»`);
          continue;
        }
        const seconds = Math.round(v.duration / 1000);
        if (seconds < 45 || seconds > 900) {
          skip("length");
          continue;
        }
        const track = (v.text_tracks ?? []).find((t) => (t.kind === "captions" || t.kind === "subtitles") && /^nb/i.test(t.srclang ?? ""));
        if (!track) {
          skip("no bokmål subtitles");
          continue;
        }
        const vtt = await (await fetch(track.src.replace(/^http:/, "https:"), { headers: { "user-agent": UA } })).text();
        const { paras, times } = cuesToParagraphs(parseVtt(vtt));
        const body = paras.join("\n\n");
        const words = (body.match(/\p{L}+/gu) ?? []).length;
        if (words < 80) {
          skip("too little speech");
          continue;
        }
        if ((body.match(NYNORSK)?.length ?? 0) > (body.match(BOKMAL)?.length ?? 0)) {
          skip("nynorsk");
          continue;
        }
        const political = (v.name + " " + body.slice(0, 2000)).match(FOREIGN_POLITICS)?.[0];
        if (political) {
          skip("foreign politics");
          continue;
        }
        const title = v.name.replace(/\s*\((nb|bokmål)\)\s*$/i, "").replace(/\s+/g, " ").trim();
        count++;
        console.log(`${save ? "save" : "would save"} | ${query} | ${title} | ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} | ${words} words | ${license}`);
        if (!save) continue;
        const credits = v.custom_fields?.licenseinfo?.trim();
        const r = await insertText({
          lang: "no",
          title,
          author: "NDLA",
          year: v.published_at?.slice(0, 4) ?? "",
          kind: "video",
          author_note: `Видео NDLA — норвежской открытой образовательной платформы — с норвежскими субтитрами. Тема: ${topicRu}.`,
          body,
          source_url: `https://ndla.no/article/${articleId}`,
          license: `${license} (NDLA${credits ? `; ${credits}` : ""})`,
          est_level: "B1",
        });
        added.add(r.status, title);
        // the player and paragraph times: with a new or replaced transcript, or for a video saved without them
        const q = admin().from("texts").update({ video: { provider: "brightcove", account, player, id: videoId, paras: times } }).eq("id", r.id);
        const { error } = await (r.status === "kept" ? q.is("video", null) : q);
        if (error) throw error;
      }
    }
  }
  await added.announce({ title: (n) => `${n} ${plural(n, ["новое видео", "новых видео", "новых видео"])} на норвежском`, author: (t) => `«${t}»`, link: "/library?kind=video" });
  console.log(`\n${count} videos ${save ? "processed (new ones added, existing kept)" : "would be imported (dry run; add --save)"}`);
  console.log("skipped:", skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
