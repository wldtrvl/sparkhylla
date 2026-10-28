import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Save = z.object({ lang: z.enum(["no", "en"]), kind: z.enum(["rule", "pattern"]), ref: z.string().max(60), body: z.string().max(2000).default("") });
const Del = z.object({ kind: z.enum(["rule", "pattern"]), ref: z.string().max(60) });

/** «Мои заметки»: keep a rule or a sentence pattern, with her own comment. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Save);
  if (isResponse(b)) return b;
  const { error } = await s.supabase
    .from("notes")
    .upsert({ user_id: s.user.id, lang: b.lang, kind: b.kind, ref: b.ref, body: b.body, updated_at: new Date().toISOString() }, { onConflict: "user_id,kind,ref" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, "note.save", { kind: b.kind, ref: b.ref, chars: b.body.length });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Del);
  if (isResponse(b)) return b;
  const { error } = await s.supabase.from("notes").delete().eq("user_id", s.user.id).eq("kind", b.kind).eq("ref", b.ref);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, "note.delete", { kind: b.kind, ref: b.ref });
  return NextResponse.json({ ok: true });
}
