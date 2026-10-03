export interface Quote {
  id: number;
  text: string;
  text_lang: string;
  translation_ru: string;
  translation_uk: string | null;
  author: string;
  author_note: string | null;
  origin: "norway" | "world";
  status: "sourced" | "attributed" | "proverb";
  source: string | null;
}

/** Calendar day number in Norway's time zone, so the quote changes at Norwegian midnight. */
export function osloDayNumber(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return Math.floor(Date.parse(`${parts}T00:00:00Z`) / 86_400_000);
}

/**
 * Deterministic quote of the day: alternates Norwegian and world quotes day by day,
 * and walks through each group in order, so every quote appears before any repeats.
 */
export function quoteOfDay(quotes: Quote[], date = new Date()): Quote | null {
  if (!quotes.length) return null;
  const day = osloDayNumber(date);
  const sorted = [...quotes].sort((a, b) => a.id - b.id);
  const norway = sorted.filter((q) => q.origin === "norway");
  const world = sorted.filter((q) => q.origin === "world");
  const group = day % 2 === 0 ? (norway.length ? norway : world) : world.length ? world : norway;
  return group[Math.floor(day / 2) % group.length];
}
