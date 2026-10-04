import { Review, type ReviewCard } from "@/components/Review";
import { WordList, type WordRow } from "@/components/WordList";
import { requireSession } from "@/lib/session";

export default async function WordsPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const now = new Date().toISOString();
  const [due, all] = await Promise.all([
    s.supabase.from("words").select("id,term,lemma,translation,context,note,kind").eq("user_id", s.user.id).eq("lang", lang).eq("status", "learning").lte("due", now).order("due").limit(30),
    s.supabase.from("words").select("id,term,translation,note,status,source,due,reps,created_at").eq("user_id", s.user.id).eq("lang", lang).order("created_at", { ascending: false }).limit(2000),
  ]);
  const words = (all.data ?? []) as WordRow[];
  const learning = words.filter((w) => w.status === "learning").length;
  const known = words.filter((w) => w.status === "known").length;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <h1 className="display">Мои слова</h1>
        <span className="muted" style={{ paddingBottom: 6 }}>
          учу {learning} · знаю {known}
        </span>
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
