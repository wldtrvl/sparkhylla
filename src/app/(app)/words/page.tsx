import { Review, type ReviewCard } from "@/components/Review";
import { WordList, type WordRow } from "@/components/WordList";
import Link from "next/link";
import { requireSession } from "@/lib/session";

export default async function WordsPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const now = new Date().toISOString();
  const [due, all, mapKnown] = await Promise.all([
    s.supabase.from("words").select("id,term,lemma,translation,context,note,kind").eq("user_id", s.user.id).eq("lang", lang).eq("status", "learning").lte("due", now).order("due").limit(30),
    // words marked «знаю» on «Карта слов» are counted, not listed: there can be thousands
    s.supabase
      .from("words")
      .select("id,term,translation,note,status,source,due,reps,created_at")
      .eq("user_id", s.user.id)
      .eq("lang", lang)
      .or("status.neq.known,source.is.null,source.neq.map")
      .order("created_at", { ascending: false })
      .limit(1000),
    s.supabase.from("words").select("id", { count: "exact", head: true }).eq("user_id", s.user.id).eq("lang", lang).eq("status", "known").eq("source", "map"),
  ]);
  const words = (all.data ?? []) as WordRow[];
  const learning = words.filter((w) => w.status === "learning").length;
  const fromMap = mapKnown.count ?? 0;
  const known = words.filter((w) => w.status === "known").length + fromMap;

  return (
    <>
      <div className="row items-end">
        <h1 className="display">Мои слова</h1>
        <span className="muted" style={{ paddingBottom: 6 }}>
          учу {learning} · знаю {known}
        </span>
        <Link href="/map" className="small ml-auto" style={{ paddingBottom: 8 }}>
          {fromMap ? `отмечено на карте слов: ${fromMap} →` : "Карта слов →"}
        </Link>
      </div>
      <div className="split">
        <div className="wide">
          <Review lang={lang} cards={(due.data ?? []) as ReviewCard[]} />
        </div>
        <div className="side">
          <WordList lang={lang} words={words} />
        </div>
      </div>
    </>
  );
}
