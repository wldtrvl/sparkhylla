/** Lenient answer checking for review cards (typed or recognised speech). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:«»"“”()]/g, " ")
    .replace(/^\s*(å|to|en|ei|et|a|an|the)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export type Verdict = "correct" | "close" | "wrong";

/** "close" = one small slip (spelling or speech recognition), allowed only for longer words. */
export function checkAnswer(answer: string, expected: string): Verdict {
  const a = normalize(answer);
  const e = normalize(expected);
  if (!a) return "wrong";
  if (a === e || a.split(" ").includes(e)) return "correct";
  const d = levenshtein(a, e);
  if (e.length >= 5 && d <= 1) return "close";
  if (e.length >= 9 && d <= 2) return "close";
  return "wrong";
}
