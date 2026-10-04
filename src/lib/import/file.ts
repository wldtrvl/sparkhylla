import "server-only";
import { strFromU8, unzipSync } from "fflate";
import { guessLang } from "@/lib/learning/coverage";
import { htmlToBody, textToBody } from "./html";
import { ImportError, type ImportDraft } from "./types";

/** Uploaded .txt or .epub (e.g. from bokselskap.no or Gutenberg). The coach confirms the rights. */
export interface FileOptions {
  /** skip EPUB sections shorter than this (title pages, colophons); default 0 */
  minSectionWords?: number;
}

/** Modern editorial material in editions of old books: never part of the original text. */
const EDITORIAL = /^(innledning|forord ved|etterord|om teksten|om forfatteren|om boka|noter|kommentarer|ordforklaringer|tekstkritisk|kolofon|introduction|afterword|notes)\b/i;

export function draftFromFile(name: string, bytes: Uint8Array, opts: FileOptions = {}): ImportDraft {
  const lower = name.toLowerCase();
  if (lower.endsWith(".epub")) return fromEpub(name, bytes, opts);
  if (lower.endsWith(".txt")) return fromText(name, bytes);
  throw new ImportError("Поддерживаются файлы .txt и .epub.");
}

const baseTitle = (name: string) => name.replace(/\.(txt|epub)$/i, "").replace(/[_-]+/g, " ").trim();

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes); // older Norwegian .txt files
  }
}

/** Keep only the book between Gutenberg's START and END markers, when present. */
function stripGutenberg(text: string): string {
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n?/i);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (start < 0 || end < 0 || end < start) return text;
  const from = text.indexOf("\n", start);
  return text.slice(from < 0 || from > end ? start : from + 1, end);
}

function fromText(name: string, bytes: Uint8Array): ImportDraft {
  const body = textToBody(stripGutenberg(decode(bytes)));
  if (!body) throw new ImportError("Файл пустой.");
  return {
    source: "file",
    title: baseTitle(name),
    author: "",
    year: "",
    lang: guessLang(body),
    kind: "story",
    body,
    sourceUrl: "",
    license: "",
    rights: "check",
    notes: ["Загруженный файл: укажите источник и лицензию и подтвердите, что текст свободен от авторских прав."],
  };
}

const meta = (opf: string, tag: string) => opf.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`))?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
const attr = (el: string, name: string) => el.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";

export interface EpubBook {
  meta: { title: string; creator: string; language: string; date: string; rights: string; subject: string; description: string };
  /** spine documents in reading order; title = the section's first heading */
  sections: { title: string | null; body: string }[];
}

/** An EPUB's metadata and its sections in reading order (navigation, editorial and tiny sections left out). */
export function epubSections(bytes: Uint8Array, opts: FileOptions = {}): EpubBook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError("Не получилось открыть EPUB (файл повреждён?).");
  }
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const opfPath = attr(read("META-INF/container.xml").match(/<rootfile\b[^>]*>/)?.[0] ?? "", "full-path");
  const opf = read(opfPath);
  if (!opf) throw new ImportError("В EPUB нет описания книги (content.opf).");
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const items = new Map<string, { href: string; type: string; props: string }>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) items.set(attr(m[0], "id"), { href: attr(m[0], "href"), type: attr(m[0], "media-type"), props: attr(m[0], "properties") });
  const sections: EpubBook["sections"] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/g)) {
    const it = items.get(attr(m[0], "idref"));
    if (!it || !/html/.test(it.type) || /\bnav\b/.test(it.props) || /(^|\/)(toc|nav)\b/i.test(it.href)) continue;
    const html = read(dir + decodeURIComponent(it.href.split("#")[0]));
    // page numbers of the printed edition, e.g. "[19]"
    const b = htmlToBody(html, { headings: "h1, h2, h3" }).replace(/\[\d+\]\s*/g, "");
    const first = b.split("\n\n")[0] ?? "";
    const words = (b.match(/\p{L}+/gu) ?? []).length;
    if (!b || EDITORIAL.test(first.replace(/^## /, "")) || words < (opts.minSectionWords ?? 0)) continue;
    sections.push({ title: first.startsWith("## ") ? first.slice(3).trim() : null, body: b });
  }
  return {
    meta: {
      title: meta(opf, "title"),
      creator: meta(opf, "creator"),
      language: meta(opf, "language").toLowerCase(),
      date: meta(opf, "date"),
      rights: meta(opf, "rights"),
      subject: meta(opf, "subject"),
      description: meta(opf, "description"),
    },
    sections,
  };
}

function fromEpub(name: string, bytes: Uint8Array, opts: FileOptions): ImportDraft {
  const book = epubSections(bytes, opts);
  let body = book.sections.map((x) => x.body).join("\n\n");
  if (/START OF (THE|THIS) PROJECT GUTENBERG/i.test(body)) body = stripGutenberg(body).trim();
  if (!body) throw new ImportError("В EPUB не нашлось текста.");
  const language = book.meta.language;
  const rights = book.meta.rights;
  return {
    source: "file",
    title: book.meta.title || baseTitle(name),
    author: book.meta.creator,
    year: book.meta.date.slice(0, 4),
    lang: language.startsWith("en") ? "en" : /^(no|nb|nn)/.test(language) ? "no" : guessLang(body),
    kind: "story",
    body,
    sourceUrl: "",
    license: rights.length < 120 ? rights : "",
    rights: "check",
    notes: [
      "Загруженный EPUB: проверьте лицензию и подтвердите, что текст свободен от авторских прав.",
      ...(rights ? [`В файле указано: «${rights.slice(0, 200)}»`] : []),
    ],
  };
}
