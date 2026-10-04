import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { toJson } from "@/lib/db-json";
import { loadPath } from "@/lib/path-data";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ lang: z.enum(["no", "en"]) });

/** Raise her reading level when the path says every goal of the current level is met (checked again here). */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const { path } = await loadPath(s, b.lang);
  if (!path.ready || !path.next) return NextResponse.json({ error: "Цели уровня ещё не выполнены." }, { status: 409 });
  const levels = { ...s.profile.levels, [b.lang]: { ...s.profile.levels[b.lang], reading: path.next } };
  const { error } = await s.supabase.from("profiles").update({ levels: toJson(levels) }).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, "decision.level_set", { lang: b.lang, skill: "reading", from: path.level, to: path.next, by: "path", tracks: path.tracks.map((t) => ({ k: t.key, done: t.done, target: t.target })) });
  return NextResponse.json({ ok: true, level: path.next });
}
