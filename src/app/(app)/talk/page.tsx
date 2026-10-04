import Link from "next/link";
import { requireSession } from "@/lib/session";

export default async function TalkIndex() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const [sc, convs] = await Promise.all([
    s.supabase.from("scenarios").select("id,title_ru,level,goals").eq("lang", lang).eq("active", true).order("sort"),
    s.supabase.from("conversations").select("id,scenario_id,started_at,ended_at,goals_done").eq("user_id", s.user.id).eq("lang", lang).order("started_at", { ascending: false }).limit(12),
  ]);
  const titles = new Map((sc.data ?? []).map((x) => [x.id, x.title_ru]));
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Oslo" });

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="display">Разговор</h1>
        <p className="lead">Ролевые игры из жизни. Говорите голосом; ошибки не исправляются во время разговора — мы разберём их в конце, по одной.</p>
      </div>
      <div className="grid">
        {(sc.data ?? []).map((x) => (
          <div key={x.id} className="card">
            <span className="chip" style={{ alignSelf: "flex-start" }}>
              {x.level}
            </span>
            <b style={{ fontFamily: "var(--f-read)", fontSize: 20 }}>{x.title_ru}</b>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              {(x.goals as { ru: string }[]).map((g) => (
                <li key={g.ru}>{g.ru}</li>
              ))}
            </ul>
            <Link className="btn" href={`/talk/${x.id}`} style={{ marginTop: "auto" }}>
              Начать
            </Link>
          </div>
        ))}
      </div>
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
