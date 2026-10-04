import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeBody } from "@/lib/import/analyze";
import { draftFromFile } from "@/lib/import/file";
import { draftFromUrl } from "@/lib/import/sources";
import { ImportError, type ImportDraft } from "@/lib/import/types";
import { coverage, fitGroup, frequencyBand } from "@/lib/learning/coverage";
import { apiSession, isResponse, logEvent, ownWordsFor } from "@/lib/session";

export const maxDuration = 60; // a Wikisource collection fetches one page per text

const UrlBody = z.object({ url: z.string().url().max(500) });
const MAX_FILE = 12_000_000;

/** Coach only: fetch a text from an open source or an uploaded file and show what would be saved. Nothing is stored. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  if (s.profile.role !== "coach") return NextResponse.json({ error: "Добавлять книги может только помощник." }, { status: 403 });

  let draft: ImportDraft;
  let input: string;
  try {
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Выберите файл." }, { status: 400 });
      if (file.size > MAX_FILE) return NextResponse.json({ error: "Файл больше 12 МБ." }, { status: 413 });
      input = file.name;
      draft = draftFromFile(file.name, new Uint8Array(await file.arrayBuffer()));
    } else {
      const b = UrlBody.safeParse(await req.json().catch(() => null));
      if (!b.success) return NextResponse.json({ error: "Вставьте ссылку целиком, начиная с https://" }, { status: 400 });
      input = b.data.url;
      draft = await draftFromUrl(b.data.url, new Date());
    }
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("import preview failed:", e);
    return NextResponse.json({ error: "Не получилось загрузить текст. Попробуйте ещё раз." }, { status: 502 });
  }
  if (!draft.body.trim()) return NextResponse.json({ error: "На странице не нашлось текста." }, { status: 422 });

  const stats = analyzeBody(draft.body, draft.lang);
  // How well it fits each linked learner (or the coach, when nobody is linked yet)
  const { data: links } = await s.supabase.from("coach_links").select("learner_id").eq("coach_id", s.user.id);
  const ids = (links ?? []).map((l) => l.learner_id as string);
  const { data: people } = await s.supabase.from("profiles").select("user_id,display_name,levels").in("user_id", ids.length ? ids : [s.user.id]);
  const fits = await Promise.all(
    (people ?? []).map(async (p) => {
      const level: string = p.levels?.[draft.lang]?.reading ?? "B1";
      const { own } = await ownWordsFor(s.supabase, p.user_id, draft.lang);
      const cov = coverage(draft.body, { band: frequencyBand(draft.lang, level), own }, draft.lang).coverage;
      return { name: p.display_name || (p.user_id === s.user.id ? "Вы" : "Ученица"), level, coverage: cov, group: fitGroup(cov) };
    }),
  );
  logEvent(s, "import.preview", { source: draft.source, input: input.slice(0, 200), words: stats.words, rights: draft.rights, orthography: stats.orthography });
  return NextResponse.json({ draft, stats, fits });
}
