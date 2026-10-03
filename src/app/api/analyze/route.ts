import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { coverage } from "@/lib/learning/coverage";
import { apiSession, isResponse, knownSets, logEvent } from "@/lib/session";

const Body = z.object({ lang: z.enum(["no", "en"]), text: z.string().min(1).max(20000), textId: z.string().optional() });

/**
 * Analyse a passage she pasted from a book she reads elsewhere (library / Bokhylla).
 * The passage itself is NOT stored — only the analysis event, without the text.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const known = await knownSets(s, b.lang);
  const c = coverage(b.text, known);
  await logEvent(s, "read.companion_paste", { textId: b.textId, tokens: c.total, coverage: Math.round(c.coverage * 1000) / 1000 });
  return NextResponse.json({ coverage: c.coverage, total: c.total, unknown: c.unknown });
}
