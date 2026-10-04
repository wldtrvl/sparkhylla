import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { checkAnswer } from "@/lib/learning/answer";
import { schedule, type StoredCard } from "@/lib/learning/srs";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({
  wordId: z.string().uuid(),
  answer: z.enum(["forgot", "hard", "good"]),
  mode: z.enum(["voice", "typed", "button"]),
  given: z.string().max(200).optional(),
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

/** Grade one review: FSRS schedules the next due date; the full before/after state is stored. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const { data: w, error } = await s.supabase.from("words").select("id,term,fsrs,reps,lapses").eq("id", b.wordId).eq("user_id", s.user.id).single();
  if (error || !w) return NextResponse.json({ error: "Слово не найдено." }, { status: 404 });
  const res = schedule((w.fsrs as StoredCard | null) ?? null, b.answer);
  const auto = b.given != null ? checkAnswer(b.given, w.term) : null;
  const upd = await s.supabase
    .from("words")
    .update({ fsrs: res.after, due: res.due.toISOString(), reps: w.reps + 1, lapses: w.lapses + (b.answer === "forgot" ? 1 : 0), updated_at: new Date().toISOString() })
    .eq("id", w.id);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  await s.supabase.from("reviews").insert({
    user_id: s.user.id,
    word_id: w.id,
    rating: res.rating,
    mode: b.mode,
    answer: b.given ?? null,
    auto_correct: auto == null ? null : auto !== "wrong",
    elapsed_ms: b.elapsedMs ?? null,
    state_before: res.before,
    state_after: res.after,
  });
  logEvent(s, "review.grade", { wordId: w.id, answer: b.answer, mode: b.mode, auto, next_due: res.due.toISOString() });
  return NextResponse.json({ due: res.due.toISOString() });
}
