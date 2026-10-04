import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { toJson, type Tables } from "@/lib/db-json";
import { newCard } from "@/lib/learning/srs";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Save = z.object({
  lang: z.enum(["no", "en"]),
  term: z.string().min(1).max(120),
  lemma: z.string().max(120).optional(),
  translation: z.string().max(200).optional(),
  note: z.string().max(400).optional(),
  kind: z.enum(["word", "phrase"]).default("word"),
  status: z.enum(["learning", "known", "ignored"]).default("learning"),
  context: z.string().max(600).optional(),
  source: z.string().max(80).optional(),
});

/** Save a word to learn, or mark it as already known (both update coverage). Idempotent per term. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Save);
  if (isResponse(b)) return b;
  const now = new Date();
  const card = b.status === "learning" ? newCard(now) : null;
  const { data: existing } = await s.supabase.from("words").select("id,status").eq("user_id", s.user.id).eq("lang", b.lang).ilike("term", b.term.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  const row = {
    user_id: s.user.id,
    lang: b.lang,
    term: b.term,
    lemma: b.lemma ?? null,
    translation: b.translation ?? null,
    note: b.note ?? null,
    kind: b.kind,
    status: b.status,
    context: b.context ?? null,
    source: b.source ?? null,
    updated_at: now.toISOString(),
    ...(existing && existing.status === "learning" && b.status === "learning" ? {} : { fsrs: card, due: card ? now.toISOString() : null }),
  };
  const q = existing ? s.supabase.from("words").update(row).eq("id", existing.id).select("id").single() : s.supabase.from("words").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, b.status === "known" ? "word.mark_known" : "word.save", { term: b.term, lang: b.lang, kind: b.kind, source: b.source, existed: !!existing });
  return NextResponse.json({ id: data.id });
}

const Patch = z.object({
  id: z.string().uuid(),
  translation: z.string().trim().max(200).optional(),
  note: z.string().trim().max(400).nullable().optional(),
  status: z.enum(["learning", "known"]).optional(),
});

/** Edit a saved word: fix the translation or note, or move it between learning and known. */
export async function PATCH(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Patch);
  if (isResponse(b)) return b;
  const { data: w } = await s.supabase.from("words").select("id,status").eq("id", b.id).eq("user_id", s.user.id).maybeSingle();
  if (!w) return NextResponse.json({ error: "Слово не найдено." }, { status: 404 });
  const now = new Date();
  const update: Tables["words"]["Update"] = { updated_at: now.toISOString() };
  if (b.translation !== undefined) update.translation = b.translation || null;
  if (b.note !== undefined) update.note = b.note || null;
  if (b.status && b.status !== w.status) {
    update.status = b.status;
    // back to learning: a fresh card due now; known: out of review
    const card = b.status === "learning" ? newCard(now) : null;
    update.fsrs = toJson(card);
    update.due = card ? now.toISOString() : null;
  }
  const { error } = await s.supabase.from("words").update(update).eq("id", b.id).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, "word.edit", { id: b.id, fields: Object.keys(update).filter((k) => k !== "updated_at"), from: w.status, to: b.status ?? w.status });
  return NextResponse.json({ ok: true });
}

const Del = z.object({ id: z.string().uuid() });

export async function DELETE(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Del);
  if (isResponse(b)) return b;
  const { error } = await s.supabase.from("words").delete().eq("id", b.id).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent(s, "word.delete", { id: b.id });
  return NextResponse.json({ ok: true });
}
