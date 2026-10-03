import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { apiSession, isResponse } from "@/lib/session";
import { synthesize } from "@/lib/speech/tts";

const Body = z.object({ text: z.string().min(1).max(4000), lang: z.enum(["no", "en"]), rate: z.number().min(0.6).max(1.2).optional() });

/** Returns {url} of cached speech, or {url:null} → the browser's own voice is used instead. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const rate = b.rate ?? Number(s.profile.settings?.tts_rate ?? 0.9);
  try {
    const url = await synthesize(b.text, b.lang, rate, s.user.id);
    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ url: null });
  }
}
