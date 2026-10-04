import { frequencyBand, isProperNoun, tokenize, type Lang } from "@/lib/learning/coverage";
import { isHeading, paginate } from "@/lib/text-format";
import { orthographyOf } from "@/lib/vocab";

export interface DraftStats {
  words: number;
  paragraphs: number;
  headings: number;
  pages: number;
  orthography: "modern" | "old";
  /** things the coach should know before saving (Russian) */
  warnings: string[];
}

/** Size, spelling era and red flags of a draft, shown in the import preview. Pure: also used on the client. */
export function analyzeBody(body: string, lang: Lang): DraftStats {
  const toks = tokenize(body);
  const paras = body.split(/\n\s*\n/).filter((p) => p.trim());
  const orthography = orthographyOf(body, lang);
  const warnings: string[] = [];
  // Pre-1907 Norwegian capitalised every noun: count capitalised words mid-sentence that are common words
  // (Hest, Mand, Døren), not names (Bergen, Olav), which an encyclopedia article is full of.
  const common = frequencyBand("no", "B2");
  const capitalisedNouns = lang === "no" ? toks.filter((t) => isProperNoun(t) && common.has(t.norm)).length / (toks.length || 1) : 0;
  if (capitalisedNouns > 0.025)
    warnings.push("Много слов с большой буквы посреди предложения — похоже на правописание до 1907 года (существительные с заглавной). Процент знакомых слов будет завышен; лучше найти издание поновее.");
  if (orthography === "old") warnings.push("Старая орфография (sig, kunde, efter…): в библиотеке будет пометка, слова засчитываются по современному написанию.");
  if (toks.length < 150) warnings.push("Очень короткий текст.");
  if (toks.length > 250_000) warnings.push("Очень длинная книга — проверьте, что в неё не попали лишние тексты.");
  return { words: toks.length, paragraphs: paras.length, headings: paras.filter(isHeading).length, pages: paginate(body).length, orthography, warnings };
}
