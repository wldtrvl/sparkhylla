import Link from "next/link";
import { requireSession } from "@/lib/session";

// groups on the page, in this order; a scenario without a topic goes last
const TOPICS: [string, string][] = [
  ["health", "Здоровье"],
  ["work", "Работа"],
  ["home", "Дом и друзья"],
  ["services", "Город и услуги"],
  ["people", "Знакомства"],
  ["travel", "Путешествия"],
  ["", "Другое"],
];

export default async function TalkIndex() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const [sc, convs, done] = await Promise.all([
    s.supabase.from("scenarios").select("id,title_ru,level,goals,topic,sort").eq("lang", lang).eq("active", true).order("sort"),
    s.supabase.from("conversations").select("id,scenario_id,started_at,ended_at,goals_done").eq("user_id", s.user.id).eq("lang", lang).order("started_at", { ascending: false }).limit(12),
    s.supabase.from("conversations").select("scenario_id").eq("user_id", s.user.id).eq("lang", lang).not("ended_at", "is", null).limit(1000),
  ]);
  const titles = new Map((sc.data ?? []).map((x) => [x.id, x.title_ru]));
  const times = new Map<string, number>();
  for (const c of done.data ?? []) if (c.scenario_id) times.set(c.scenario_id, (times.get(c.scenario_id) ?? 0) + 1);
  // within a topic: the ones she has not tried yet first, then the least practised
  const groups = TOPICS.map(([key, label]) => ({
    label,
    items: (sc.data ?? []).filter((x) => (TOPICS.some(([k]) => k && k === x.topic) ? x.topic : "") === key).sort((a, b) => (times.get(a.id) ?? 0) - (times.get(b.id) ?? 0) || a.sort - b.sort),
  })).filter((g) => g.items.length);
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Oslo" });

  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Разговор</h1>
        <p className="lead">Ролевые игры из жизни. Говорите голосом; ошибки не исправляются во время разговора — мы разберём их в конце, по одной.</p>
      </div>
      {groups.map((g) => (
        <section key={g.label} className="stack" style={{ gap: 12 }}>
          <h2 className="h2">{g.label}</h2>
          <div className="grid">
            {g.items.map((x) => (
              <div key={x.id} className="card">
                <div className="row" style={{ gap: 6 }}>
                  <span className="chip">{x.level}</span>
                  {times.get(x.id) ? <span className="chip">было {times.get(x.id)}×</span> : <span className="chip new-chip">новое</span>}
                </div>
                <b className="title-read">{x.title_ru}</b>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {(x.goals as { ru: string }[]).map((goal) => (
                    <li key={goal.ru}>{goal.ru}</li>
                  ))}
                </ul>
                <Link className="btn mt-auto" href={`/talk/${x.id}`}>
                  Начать
                </Link>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!!convs.data?.length && (
        <section className="card">
          <h2 className="h2">Прошлые разговоры</h2>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {convs.data.map((c) => (
                  <tr key={c.id}>
                    <td>{fmt.format(new Date(c.started_at))}</td>
                    <td>{(c.scenario_id && titles.get(c.scenario_id)) ?? c.scenario_id ?? "—"}</td>
                    <td className="small muted">целей: {c.goals_done.length}</td>
                    <td>{c.ended_at ? <Link href={`/talk/review/${c.id}`}>Разбор</Link> : <span className="small muted">не завершён</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
