import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { TEXT_KINDS } from "@/lib/import/types";
import { tokenize } from "@/lib/learning/coverage";
import { apiSession, isResponse, logEvent } from "@/lib/session";
import { writeVocab } from "@/lib/vocab";

export const maxDuration = 60;

const Body = z.object({
  source: z.enum(["gutenberg", "wikisource", "wikipedia", "snl", "file"]),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(200),
  year: z.string().trim().max(40),
  lang: z.enum(["no", "en"]),
  kind: z.enum(TEXT_KINDS),
  body: z.string().min(50).max(3_000_000),
  sourceUrl: z.string().trim().max(500),
  license: z.string().trim().min(3).max(300),
  // "blocked" drafts cannot be sent; "check" needs the coach's confirmation
  rights: z.enum(["ok", "check"]),
  confirmed: z.boolean(),
  estLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  authorNote: z.string().trim().max(600),
});

/** Coach only: store an open-licence text in full (RLS: coach writes texts and text_vocab) and build its vocabulary. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  if (s.profile.role !== "coach") return NextResponse.json({ error: "Добавлять книги может только помощник." }, { status: 403 });
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  if (b.rights === "check" && !b.confirmed) return NextResponse.json({ error: "Подтвердите, что текст свободен от авторских прав." }, { status: 400 });

  const row = {
    lang: b.lang,
    title: b.title,
    author: b.author,
    author_note: b.authorNote || null,
    year: b.year || null,
    kind: b.kind,
    availability: "in_app" as const,
    body: b.body,
    source_url: b.sourceUrl || null,
    license: b.license,
    est_level: b.estLevel,
    word_count: tokenize(b.body).length,
    created_by: s.user.id,
  };
  const { data: existing } = await s.supabase.from("texts").select("id").eq("title", b.title).eq("author", b.author).eq("lang", b.lang).maybeSingle();
  const saved = existing
    ? await s.supabase.from("texts").update(row).eq("id", existing.id).select("id").single()
    : await s.supabase.from("texts").insert(row).select("id").single();
  if (saved.error) return NextResponse.json({ error: `Не сохранилось: ${saved.error.message}` }, { status: 500 });
  try {
    await writeVocab(s.supabase, saved.data.id, b.body, b.lang);
  } catch (e) {
    console.error("import: vocabulary failed", e);
    return NextResponse.json({ error: "Текст сохранён, но словарь книги не построился. Запустите npm run vocab:build." }, { status: 500 });
  }
  logEvent(s, "import.save", { textId: saved.data.id, source: b.source, words: row.word_count, rights: b.rights, confirmed: b.confirmed, replaced: !!existing });
  return NextResponse.json({ id: saved.data.id, replaced: !!existing });
}
