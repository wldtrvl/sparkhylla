/**
 * Tolerant JSON extraction: whole reply, else a fenced block, else the outermost {...} or [...].
 * Models differ in how strictly they follow "reply with JSON only"; this keeps parsing predictable.
 */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {}
  }
  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {}
    }
  }
  throw new Error("No JSON found in model reply");
}
