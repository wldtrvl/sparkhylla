import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { createPack, todayPack } from "@/lib/packs-data";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ theme: z.string().max(40), minutes: z.union([z.literal(15), z.literal(30), z.literal(45)]) });

/** Start «Набор дня» on the theme she picked, in her active language (or return the one already running today). */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const lang = s.profile.active_lang;
  const now = Date.now();
  const running = await todayPack(s, lang, now);
  if (running?.status === "active") return NextResponse.json({ id: running.id, existed: true });
  try {
    const pack = await createPack(s, lang, b.theme, b.minutes, now);
    logEvent(s, "pack.start", { packId: pack.id, theme: b.theme, minutes: b.minutes, lang, steps: pack.plan.steps });
    return NextResponse.json({ id: pack.id });
  } catch (e) {
    console.error("pack: create failed", e);
    return NextResponse.json({ error: "Не получилось собрать набор. Попробуйте другую тему." }, { status: 500 });
  }
}
