import type { Lang } from "@/lib/learning/coverage";

export type TextKind = "novel" | "story" | "tale" | "fable" | "article" | "news" | "other";
export const TEXT_KINDS: TextKind[] = ["novel", "story", "tale", "fable", "article", "news", "other"];

/**
 * Whether the text may be stored in full (rule: originals that are public domain or openly licensed only).
 * ok: verified from the source; check: the coach must confirm; blocked: cannot be saved.
 */
export type Rights = "ok" | "check" | "blocked";

export interface ImportDraft {
  source: "gutenberg" | "wikisource" | "wikipedia" | "snl" | "file";
  title: string;
  author: string;
  year: string;
  lang: Lang;
  kind: TextKind;
  /** paragraphs separated by blank lines; "## " paragraphs are headings */
  body: string;
  sourceUrl: string;
  license: string;
  rights: Rights;
  /** why the rights are what they are, and other things to check (Russian, shown in the preview) */
  notes: string[];
}

export class ImportError extends Error {}
