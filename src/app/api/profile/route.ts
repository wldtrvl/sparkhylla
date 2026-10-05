import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { toJson, type Tables } from "@/lib/db-json";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Level = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const Skills = z.object({ reading: Level, speaking: Level, writing: Level });

const Body = z.object({
  active_lang: z.enum(["no", "en"]).optional(),
  ui_lang: z.enum(["ru", "uk"]).optional(),
  display_name: z.string().max(60).optional(),
  levels: z.object({ no: Skills, en: Skills }).optional(),
  settings: z.object({ tts_rate: z.number().min(0.6).max(1.2).optional(), updates_seen_at: z.string().datetime({ offset: true }).optional() }).optional(),
});

export async function PATCH(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const body = await parseBody(req, Body);
  if (isResponse(body)) return body;
  const patch: Tables["profiles"]["Update"] = { ...body, levels: body.levels ? toJson(body.levels) : undefined, settings: body.settings ? toJson({ ...s.profile.settings, ...body.settings }) : undefined };
  const { error } = await s.supabase.from("profiles").update(patch).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.levels) logEvent(s, "decision.level_set", { from: s.profile.levels, to: body.levels, by: "manual" });
  return NextResponse.json({ ok: true });
}
