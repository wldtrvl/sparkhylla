import "server-only";
import { htmlToBody, textToBody } from "./html";
import { ImportError, type ImportDraft, type Rights } from "./types";

/**
 * Fetchers for open sources. Only these hosts are ever requested (no arbitrary URLs from the server).
 * Norway: a work is public domain from 1 January of the 71st year after the author's death.
 */
const HOSTS = /^(www\.)?(gutenberg\.org|snl\.no|(no|en)\.wikisource\.org|(no|en)\.wikipedia\.org)$/;
// Wikimedia allows 10 requests/minute to clients without a contact in the User-Agent and 200/minute with one
// (mediawiki.org/wiki/Wikimedia_APIs/Rate_limits). IMPORT_CONTACT (an e-mail or URL) is needed for collections.
const contact = () => process.env.IMPORT_CONTACT?.trim() ?? "";
const ua = () => `Sprakhylla/0.1 (personal language-learning app${contact() ? `; ${contact()}` : ""})`;
const MAX_BYTES = 12_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchFrom(url: string, as: "text" | "json"): Promise<string | unknown> {
  let res: Response | null = null;
  // "429 Too Many Requests": wait as asked (at most 8 s) and try again, up to 3 times
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, { headers: { "user-agent": ua(), accept: as === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(25_000) });
    if (res.status !== 429 || attempt === 3) break;
    await sleep(Math.min(10, Number(res.headers.get("retry-after")) || 2 ** attempt * 1.5) * 1000);
  }
  res = res!;
  if (res.status === 429) throw new ImportError("Источник просит подождать (слишком много запросов). Попробуйте через минуту.");
  if (!HOSTS.test(new URL(res.url).hostname)) throw new ImportError("Источник перенаправил на другой сайт.");
  if (res.status === 404) throw new ImportError("Страница не найдена. Проверьте ссылку.");
  if (!res.ok) throw new ImportError(`Источник ответил ошибкой ${res.status}. Попробуйте позже.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new ImportError("Текст слишком большой для одной книги.");
  return as === "json" ? JSON.parse(text) : text;
}

export function publicDomainInNorway(deathYear: number, now: Date): boolean {
  return deathYear + 70 < now.getFullYear();
}

export function supportedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? (HOSTS.test(u.hostname) ? u : null) : null;
  } catch {
    return null;
  }
}

export async function draftFromUrl(raw: string, now: Date): Promise<ImportDraft> {
  const u = supportedUrl(raw);
  if (!u) throw new ImportError("Поддерживаются ссылки на gutenberg.org, no/en.wikisource.org, no/en.wikipedia.org и snl.no.");
  const host = u.hostname.replace(/^www\./, "");
  if (host === "gutenberg.org") return gutenberg(u, now);
  if (host === "snl.no") return snl(u);
  if (host.endsWith("wikisource.org")) return wikisource(u);
  return wikipedia(u, now);
}

/* ---------- Project Gutenberg ---------- */

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim() ?? "";

async function gutenberg(u: URL, now: Date): Promise<ImportDraft> {
  const id = u.pathname.match(/\/(?:ebooks|epub|files)\/(\d+)/)?.[1];
  if (!id) throw new ImportError("Не нашёл номер книги в ссылке Gutenberg (нужна ссылка вида gutenberg.org/ebooks/12345).");
  const [raw, rdf] = (await Promise.all([
    fetchFrom(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, "text"),
    fetchFrom(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.rdf`, "text"),
  ])) as [string, string];
  const start = raw.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  const end = raw.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (start < 0 || end < 0) throw new ImportError("Не нашёл начало и конец текста в файле Gutenberg.");
  const language = rdf.match(/<dcterms:language>[\s\S]*?<rdf:value[^>]*>([a-z-]+)<\/rdf:value>/)?.[1] ?? "";
  const lang = language === "en" ? "en" : ["no", "nb", "nn"].includes(language) ? "no" : null;
  const creators = [...rdf.matchAll(/<dcterms:creator>[\s\S]*?<\/dcterms:creator>/g)].map((m) => m[0]);
  const names = creators.map((c) => tag(c, "pgterms:name").replace(/^([^,]+),\s*(.+)$/, "$2 $1"));
  const deaths = creators.map((c) => Number(tag(c, "pgterms:deathdate")) || null);
  const notes: string[] = [];
  let rights: Rights = "check";
  if (!creators.length) notes.push("У книги нет автора в каталоге (сборник или аноним) — проверьте статус сами.");
  else if (deaths.some((d) => d == null)) notes.push("Год смерти автора неизвестен — проверьте, что прошло больше 70 лет.");
  else if (deaths.every((d) => publicDomainInNorway(d!, now))) {
    rights = "ok";
    notes.push(`Автор умер в ${Math.max(...(deaths as number[]))} году — в Норвегии текст свободен от авторских прав.`);
  } else {
    rights = "blocked";
    notes.push(`Автор умер в ${Math.max(...(deaths as number[]))} году — в Норвегии текст ещё под авторским правом (70 лет после смерти).`);
  }
  if (!lang) {
    rights = "blocked";
    notes.push(`Язык книги (${language || "неизвестен"}) не норвежский и не английский.`);
  }
  return {
    source: "gutenberg",
    title: tag(rdf, "dcterms:title").split("\n")[0] || `Gutenberg ${id}`,
    author: names.join(", "),
    year: "",
    lang: lang ?? "en",
    kind: "novel",
    body: textToBody(raw.slice(raw.indexOf("\n", start) + 1, end)),
    sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
    license: "public domain (Project Gutenberg)",
    rights,
    notes,
  };
}

/* ---------- Store norske leksikon ---------- */

interface SnlArticle {
  title: string;
  url: string;
  xhtml_body: string;
  license_name: string;
  authors?: { full_name: string }[];
  changed_at?: string;
  language?: string;
}

async function snl(u: URL): Promise<ImportDraft> {
  const path = u.pathname.replace(/\/$/, "").replace(/\.json$/, "");
  if (!path || path === "/") throw new ImportError("Нужна ссылка на конкретную статью snl.no.");
  const a = (await fetchFrom(`https://snl.no${path}.json`, "json")) as SnlArticle;
  const title = a.title.charAt(0).toUpperCase() + a.title.slice(1);
  let body = htmlToBody(a.xhtml_body);
  // SNL articles continue the title: "fjord" + "er en forgrenet innskjæring…"
  if (/^\p{Ll}/u.test(body)) body = `${title} ${body}`;
  const free = a.license_name === "fri";
  return {
    source: "snl",
    title,
    author: (a.authors ?? []).map((x) => x.full_name).join(", ") || "Store norske leksikon",
    year: a.changed_at?.slice(0, 4) ?? "",
    lang: "no",
    kind: "article",
    body,
    sourceUrl: a.url,
    license: free ? "CC BY-SA 3.0 (Store norske leksikon)" : `SNL: ${a.license_name}`,
    rights: free ? "ok" : "blocked",
    notes: [
      free ? "Статья под свободной лицензией CC BY-SA: можно хранить с указанием авторов." : "У этой статьи ограниченная лицензия SNL — её нельзя сохранить целиком.",
      ...(a.language === "nn" ? ["Статья на нюнорске — частотный словарь рассчитан на букмол."] : []),
    ],
  };
}

/* ---------- Wikipedia ---------- */

async function wikipedia(u: URL, now: Date): Promise<ImportDraft> {
  const lang = u.hostname.startsWith("en.") ? "en" : "no";
  const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
  if (!title || title.includes(":")) throw new ImportError("Нужна ссылка на статью Википедии.");
  const html = (await fetchFrom(`https://${u.hostname}/api/rest_v1/page/html/${encodeURIComponent(title)}`, "text")) as string;
  return {
    source: "wikipedia",
    title: title.replace(/_/g, " "),
    author: lang === "en" ? "Wikipedia contributors" : "Wikipedia-bidragsytere",
    year: String(now.getFullYear()),
    lang,
    kind: "article",
    body: htmlToBody(html),
    sourceUrl: `https://${u.hostname}/wiki/${encodeURIComponent(title)}`,
    license: "CC BY-SA 4.0 (Wikipedia)",
    rights: "ok",
    notes: ["Статья Википедии под лицензией CC BY-SA: хранится с указанием источника."],
  };
}

/* ---------- Wikisource (single texts and collections of linked texts) ---------- */

interface WsParse {
  parse?: { title: string; text?: { "*": string }; wikitext?: { "*": string }; links?: { ns: number; "*": string; exists?: string }[] };
  error?: { info: string };
}

async function wsPage(host: string, page: string) {
  const q = new URLSearchParams({ action: "parse", page, prop: "text|wikitext", format: "json", redirects: "1" });
  const d = (await fetchFrom(`https://${host}/w/api.php?${q}`, "json")) as WsParse;
  if (!d.parse) throw new ImportError(`Wikisource: ${d.error?.info ?? "страница не найдена"}`);
  return { title: d.parse.title, html: d.parse.text?.["*"] ?? "", wikitext: d.parse.wikitext?.["*"] ?? "" };
}

const wsBody = (html: string) => htmlToBody(html, { root: ".prp-pages-output" }) || htmlToBody(html, { root: ".mw-parser-output" });

/**
 * Main-namespace pages linked from the text itself, in order (a collection's table of contents).
 * The header above the text (author, previous/next text) is not part of it.
 */
function wsLinks(html: string, self: string): string[] {
  const start = html.indexOf("prp-pages-output");
  const content = start >= 0 ? html.slice(start) : html;
  const titles: string[] = [];
  for (const m of content.matchAll(/<a href="\/wiki\/[^"#]+"[^>]*title="([^"]+)"/g)) {
    const t = m[1].replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    if (!t.includes(":") && t !== self && !titles.includes(t)) titles.push(t);
  }
  return titles;
}

/**
 * The texts to fetch when a page is a collection: its own subpages (Title/1, Title/2…), or the links of a
 * table-of-contents page with almost no text of its own. A short single text with a few links is not one.
 */
export function collectionLinks(html: string, title: string, bodyLength: number): string[] {
  const all = wsLinks(html, title);
  const subpages = all.filter((t) => t.startsWith(`${title}/`));
  const links = subpages.length >= 3 ? subpages : bodyLength < 600 ? all : [];
  return links.length >= 3 ? links : [];
}

const linkText = (s: string) => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/''+/g, "").trim();

async function wikisource(u: URL): Promise<ImportDraft> {
  const host = u.hostname;
  const lang = host.startsWith("en.") ? "en" : "no";
  const page = decodeURIComponent(u.pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
  const main = await wsPage(host, page);
  let body = wsBody(main.html);
  const notes: string[] = [];
  const links = collectionLinks(main.html, main.title, body.length);
  if (links.length) {
    if (!contact())
      throw new ImportError(
        `Это оглавление сборника (текстов в нём: ${links.length}). Чтобы загрузить его целиком, добавьте IMPORT_CONTACT (ваш e-mail или адрес сайта) в настройки сервера — Wikimedia разрешает анонимным программам только 10 запросов в минуту. Отдельный текст можно загрузить и без этого.`,
      );
    const parts: string[] = [];
    for (const t of links.slice(0, 80)) {
      await sleep(300); // one request at a time, politely
      const p = await wsPage(host, t);
      const b = wsBody(p.html);
      if (b.length > 200) parts.push(`## ${p.title.split("/").pop()}\n\n${b}`);
    }
    if (parts.length) {
      body = parts.join("\n\n");
      notes.push(`Сборник: загружено ${parts.length} текстов по оглавлению${links.length > 80 ? " (первые 80)" : ""}.`);
    }
  }
  // Edition data from the scan's index page (Tittel/Forfatter/År, or Title/Author/Year)
  const index = main.wikitext.match(/<pages index="([^"]+)"/)?.[1];
  let title = main.title;
  let author = "";
  let year = "";
  if (index) {
    const idx = await wsPage(host, `Index:${index}`).catch(() => null);
    // one "|Field=value" per line; values may contain [[link|text]]
    const field = (names: string[]) => linkText(idx?.wikitext.match(new RegExp(`^\\|\\s*(?:${names.join("|")})\\s*=(.*)$`, "m"))?.[1] ?? "");
    const book = field(["Tittel", "Title"]);
    author = field(["Forfatter", "Author"]);
    year = field(["Ar", "År", "Year"]);
    // a whole collection takes the book's title; a single text keeps its own and names the book
    if (links.length && book) title = book;
    else if (book && book !== title) notes.push(`Текст из книги «${book}»${year ? `, ${year}` : ""}.`);
  }
  const pd = main.wikitext.match(/\{\{\s*(PD[^}|]*)/i)?.[1]?.trim();
  if (pd) notes.push(`Wikisource отмечает текст как общественное достояние ({{${pd}}}).`);
  else notes.push("Wikisource не указывает статус прав на этой странице — проверьте сами.");
  return {
    source: "wikisource",
    title,
    author,
    year,
    lang,
    kind: "story",
    body,
    sourceUrl: `https://${host}/wiki/${encodeURIComponent(main.title.replace(/ /g, "_"))}`,
    license: pd ? `public domain (Wikisource ${pd})` : "",
    rights: pd ? "ok" : "check",
    notes,
  };
}
