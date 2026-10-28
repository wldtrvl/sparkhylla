import Link from "next/link";
import { PackResultCard } from "@/components/PackViews";
import { themeOf } from "@/lib/learning/packs";
import type { PackRow } from "@/lib/packs-data";
import { requireSession } from "@/lib/session";

const fmtDay = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "Europe/Oslo" });

/** «Мои наборы»: every day's pack with what she gathered, newest first. */
export default async function PacksPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const { data } = await s.supabase.from("packs").select("id,lang,day,theme,minutes,plan,progress,results,status,started_at,finished_at").eq("user_id", s.user.id).eq("lang", lang).neq("status", "cancelled").order("started_at", { ascending: false }).limit(90);
  const packs = (data ?? []) as unknown as PackRow[];
  const finished = packs.filter((p) => p.status === "finished" && p.results);
  const total = finished.reduce(
    (t, p) => ({ minutes: t.minutes + p.results!.minutes, words: t.words + p.results!.collected.length, said: t.said + p.results!.said.length }),
    { minutes: 0, words: 0, said: 0 },
  );

  return (
    <>
      <div className="stack gap-4">
        <span className="eyebrow">{lang === "no" ? "Norsk" : "English"}</span>
        <h1 className="display">Мои наборы</h1>
        <p className="lead">
          {finished.length ? `Наборов: ${finished.length} · ${total.minutes} мин · собрано слов: ${total.words} · сказано вслух: ${total.said}.` : "Здесь будут ваши наборы дня и всё, что вы в них собрали."}
        </p>
      </div>
      {packs.map((p) => (
        <section key={p.id} className="card">
          <div className="row" style={{ gap: 8 }}>
            <span className="eyebrow">{fmtDay.format(new Date(`${p.day}T12:00:00Z`))}</span>
            <b className="title-read">{themeOf(p.theme)?.title ?? p.theme}</b>
            <span className="chip">{p.minutes} мин</span>
            {p.status === "active" ? (
              <Link className="btn small ml-auto" href={`/pack/${p.id}`}>
                Продолжить
              </Link>
            ) : (
              <Link className="small ml-auto" href={`/pack/${p.id}`}>
                Подробнее →
              </Link>
            )}
          </div>
          {p.results && <PackResultCard pack={p} results={p.results} compact />}
        </section>
      ))}
      <Link href="/" className="small">
        ← Мой стол
      </Link>
    </>
  );
}
