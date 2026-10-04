import "server-only";
import { GRAMMAR } from "@/lib/learning/grammar";
import type { Lang } from "@/lib/learning/coverage";
import { computePath, type PathState } from "@/lib/learning/path";
import { libraryFor, type LibraryItem } from "@/lib/library";
import { asRecord } from "@/lib/db-json";
import type { DailyActivity, Session } from "@/lib/session";
import { requestClock } from "@/lib/time";

/** Everything the path needs from her data, in parallel; shared by /path, the desk and the level-up action. */
export async function loadPath(s: Session, lang: Lang): Promise<{ path: PathState; library: LibraryItem[] }> {
  const uid = s.user.id;
  const clock = requestClock();
  const [words, due, finished, talks, scenarios, grammar, activity, library] = await Promise.all([
    s.supabase.from("words").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("lang", lang).in("status", ["learning", "known"]),
    s.supabase.from("words").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("lang", lang).eq("status", "learning").lte("due", clock.iso),
    s.supabase.from("reading_progress").select("text_id, texts!inner(lang)", { count: "exact", head: true }).eq("user_id", uid).not("finished_at", "is", null).eq("texts.lang", lang),
    s.supabase.from("conversations").select("scenario_id").eq("user_id", uid).eq("lang", lang).not("ended_at", "is", null),
    s.supabase.from("scenarios").select("id,title_ru").eq("lang", lang).eq("active", true).order("sort"),
    s.supabase.from("events").select("props").eq("user_id", uid).eq("type", "grammar.explain").limit(500),
    s.supabase.rpc("daily_activity", { p_user: uid, p_since: clock.daysAgo(13).slice(0, 10) }),
    libraryFor(s, lang),
  ]);
  const doneScenarios = new Set((talks.data ?? []).map((c) => c.scenario_id));
  const scenario = (scenarios.data ?? []).find((x) => !doneScenarios.has(x.id)) ?? scenarios.data?.[0] ?? null;
  const reading = library.find((b) => b.progress && !b.progress.finished) ?? null;
  const suggested = library.find((b) => b.availability === "in_app" && !b.progress && b.group !== "later") ?? library.find((b) => b.availability === "in_app" && !b.progress) ?? null;
  const path = computePath({
    level: s.profile.levels[lang]?.reading ?? "B1",
    words: words.count ?? 0,
    due: due.count ?? 0,
    textsFinished: finished.count ?? 0,
    reading: reading && { id: reading.id, title: reading.title },
    suggested: suggested && { id: suggested.id, title: suggested.title },
    talks: talks.data?.length ?? 0,
    scenario: scenario && { id: scenario.id, title: scenario.title_ru },
    grammarDone: [...new Set((grammar.data ?? []).map((e) => String(asRecord(e.props).key ?? "")))],
    grammarTopics: GRAMMAR.filter((g) => g.lang === lang).map((g) => ({ key: g.key, title: g.title, level: g.level })),
    activeDays: ((activity.data ?? []) as DailyActivity[]).filter((d) => Number(d.minutes) >= 1).length,
  });
  return { path, library };
}
