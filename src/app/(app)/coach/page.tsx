import Link from "next/link";
import { redirect } from "next/navigation";
import { ruleLabel } from "@/lib/learning/grammar";
import { asRecord } from "@/lib/db-json";
import { requireSession, type DailyActivity } from "@/lib/session";
import { requestClock } from "@/lib/time";

const VITALS = [
  ["TTFB", "Ответ сервера (TTFB)"],
  ["FCP", "Первый текст (FCP)"],
  ["LCP", "Страница готова (LCP)"],
  ["INP", "Отклик на нажатие (INP)"],
  ["CLS", "Сдвиги вёрстки (CLS)"],
] as const;

const sum = (xs: (number | string | null)[]) => xs.reduce<number>((a, x) => a + Number(x ?? 0), 0);

export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  const s = await requireSession();
  if (s.profile.role !== "coach") redirect("/");
  const { data: links } = await s.supabase.from("coach_links").select("learner_id").eq("coach_id", s.user.id);
  const learnerIds = (links ?? []).map((l) => l.learner_id as string);
  const { data: learners } = await s.supabase.from("profiles").select("user_id,display_name").in("user_id", learnerIds.length ? learnerIds : [s.user.id]);
  const sp = await searchParams;
  const uid = (typeof sp.u === "string" && learnerIds.includes(sp.u) ? sp.u : learnerIds[0]) ?? s.user.id;
  const clock = requestClock();
  const since30 = clock.daysAgo(29);
  const since7 = clock.daysAgo(7);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [act, words, reviews, convs, fb, llm, speech, models, events, vitals, errors] = await Promise.all([
    s.supabase.rpc("daily_activity", { p_user: uid, p_since: since30.slice(0, 10) }),
    s.supabase.from("words").select("status,reps,lang,created_at").eq("user_id", uid),
    s.supabase.from("reviews").select("rating,mode,auto_correct,created_at").eq("user_id", uid).gte("created_at", since7),
    s.supabase.from("conversations").select("id,scenario_id,lang,goals_done,started_at,ended_at").eq("user_id", uid).gte("started_at", since30),
    s.supabase.from("feedback_items").select("rule_key,status,lang,created_at").eq("user_id", uid),
    s.supabase.from("llm_calls").select("cost_usd").eq("user_id", uid).gte("created_at", monthStart),
    s.supabase.from("speech_calls").select("cost_usd").eq("user_id", uid).gte("created_at", monthStart),
    s.supabase.from("v_model_comparison").select("*").order("task"),
    s.supabase.from("events").select("type,props,created_at").eq("user_id", uid).neq("type", "activity.heartbeat").neq("type", "perf.vital").order("created_at", { ascending: false }).limit(40),
    s.supabase.from("events").select("props").eq("user_id", uid).eq("type", "perf.vital").gte("created_at", since7).limit(5000),
    s.supabase.from("app_errors").select("created_at,path,message,route_type").order("created_at", { ascending: false }).limit(10),
  ]);

  const days = clock.dayKeys(30);
  const minutesByDay = new Map(((act.data ?? []) as DailyActivity[]).map((d) => [String(d.day), Number(d.minutes)]));
  const minutes7 = sum(days.slice(-7).map((d) => minutesByDay.get(d) ?? 0));
  const maxMin = Math.max(30, ...days.map((d) => minutesByDay.get(d) ?? 0));
  const w = words.data ?? [];
  const r = reviews.data ?? [];
  const recalled = r.filter((x) => x.rating >= 3).length;
  const spend = sum((llm.data ?? []).map((x) => x.cost_usd)) + sum((speech.data ?? []).map((x) => x.cost_usd));
  const rules: Record<string, { n: number; selfFixed: number }> = {};
  for (const f of fb.data ?? []) {
    if (!f.rule_key) continue;
    const x = (rules[f.rule_key] ??= { n: 0, selfFixed: 0 });
    x.n++;
    if (f.status === "self_fixed") x.selfFixed++;
  }
  const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const fmtTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Кабинет помощника</span>
          <h1 className="display">{learners?.find((l) => l.user_id === uid)?.display_name || "Ученица"}</h1>
        </div>
        <div className="row" style={{ marginLeft: "auto" }}>
          {(learners ?? []).length > 1 &&
            learners!.map((l) => (
              <Link key={l.user_id} className="btn soft small" href={`/coach?u=${l.user_id}`}>
                {l.display_name}
              </Link>
            ))}
          <Link className="btn small" href="/coach/import">
            Добавить книгу
          </Link>
          <a className="btn ghost small" href={`/api/export?table=events&u=${uid}`}>
            Скачать события (CSV)
          </a>
          <a className="btn ghost small" href={`/api/export?table=llm_calls&u=${uid}`}>
            Скачать вызовы AI (CSV)
          </a>
        </div>
      </div>
      {!learnerIds.length && <p className="notice">Ученица ещё не привязана. Добавьте строку в таблицу coach_links (см. README → «Связать помощника и ученицу»).</p>}

      <div className="grid">
        {[
          ["Минут за 7 дней", Math.round(minutes7), `в среднем ${Math.round(minutes7 / 7)} мин в день`],
          ["Слов в работе / знает", `${w.filter((x) => x.status === "learning").length} / ${w.filter((x) => x.status === "known").length}`, `${w.filter((x) => x.created_at >= since7).length} новых за неделю`],
          ["Повторений за 7 дней", r.length, r.length ? `вспомнила ${Math.round((recalled / r.length) * 100)}%` : "—"],
          ["Разговоров за 30 дней", (convs.data ?? []).length, `голосом: ${r.filter((x) => x.mode === "voice").length} ответов в повторении`],
          ["Расходы на AI в этом месяце", `$${spend.toFixed(2)}`, "модели + речь"],
        ].map(([label, value, sub]) => (
          <div key={String(label)} className="card" style={{ gap: 4 }}>
            <span className="small muted">{label}</span>
            <span className="num" style={{ fontFamily: "var(--f-display)", fontSize: 34, fontWeight: 600 }}>
              {value}
            </span>
            <span className="small muted">{sub}</span>
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="h2">Минуты занятий по дням, 30 дней</h2>
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 8 }}>
          <div className="small muted num" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 160, textAlign: "right" }}>
            <span>{maxMin}</span>
            <span>{Math.round(maxMin / 2)}</span>
            <span>0</span>
          </div>
          <div style={{ height: 160, display: "grid", gridTemplateColumns: "repeat(30, minmax(0,1fr))", gap: 2, alignItems: "end", borderBottom: "1px solid var(--line)" }}>
            {days.map((d) => {
              const m = minutesByDay.get(d) ?? 0;
              return (
                <div key={d} title={`${fmtDay.format(new Date(d))}: ${Math.round(m)} мин`} style={{ height: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: `${(m / maxMin) * 100}%`, background: "var(--cloth)", borderRadius: "4px 4px 0 0", minHeight: m > 0 ? 2 : 0 }} />
                </div>
              );
            })}
          </div>
          <span />
          <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{fmtDay.format(new Date(days[0]))}</span>
            <span>сегодня</span>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="wide card">
          <h2 className="h2">Повторяющиеся ошибки</h2>
          <p className="small muted">«Исправила сама» — после подсказки нашла ответ без показа решения. Рост этой доли = тема усваивается.</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Тема</th>
                  <th>Раз</th>
                  <th>Исправила сама</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rules)
                  .sort((a, b) => b[1].n - a[1].n)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>{ruleLabel(k)}</td>
                      <td className="num">{v.n}</td>
                      <td className="num">{Math.round((v.selfFixed / v.n) * 100)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!Object.keys(rules).length && <p className="small muted">Пока нет разборов разговоров.</p>}
          </div>
        </section>
        <section className="side card">
          <h2 className="h2">Последние действия</h2>
          <div className="stack small" style={{ gap: 6, maxHeight: 420, overflowY: "auto" }}>
            {(events.data ?? []).map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
                <span className="muted num">{fmtTime.format(new Date(e.created_at))}</span>
                <span>
                  <b>{e.type}</b> <span className="muted">{summarizeProps(asRecord(e.props))}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="h2">Сравнение моделей</h2>
        <p className="small muted">Все вызовы AI с задачей, моделью, задержкой и стоимостью. Чтобы сравнить модели на реальных занятиях, добавьте в model_routes две строки на одну задачу с весами (см. README).</p>
        <div className="table-wrap">
          <table className="data num">
            <thead>
              <tr>
                <th>Задача</th>
                <th>Модель</th>
                <th>Вызовов</th>
                <th>Средняя задержка</th>
                <th>p95</th>
                <th>Стоимость</th>
                <th>Ошибок</th>
              </tr>
            </thead>
            <tbody>
              {(models.data ?? []).map((m, i) => (
                <tr key={i}>
                  <td>{m.task}</td>
                  <td>{m.variant ?? `${m.provider}:${m.model}`}</td>
                  <td>{m.calls}</td>
                  <td>{m.avg_latency_ms} мс</td>
                  <td>{Math.round(Number(m.p95_latency_ms))} мс</td>
                  <td>${Number(m.cost_usd ?? 0).toFixed(3)}</td>
                  <td>{m.error_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2 className="h2">Скорость и ошибки, 7 дней</h2>
        <p className="small muted">Как быстро открываются страницы у неё на устройстве (медиана), и ошибки сервера. «Хорошо» — по меркам Google Web Vitals.</p>
        <div className="table-wrap">
          <table className="data num">
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Медиана</th>
                <th>Хорошо</th>
                <th>Замеров</th>
              </tr>
            </thead>
            <tbody>
              {VITALS.map(([name, label]) => {
                const xs = (vitals.data ?? []).map((v) => asRecord(v.props)).filter((p) => p.name === name);
                const values = xs.map((p) => Number(p.value)).sort((a, b) => a - b);
                if (!values.length) return null;
                const median = values[Math.floor(values.length / 2)];
                return (
                  <tr key={name}>
                    <td>{label}</td>
                    <td>{name === "CLS" ? median.toFixed(3) : `${median} мс`}</td>
                    <td>{Math.round((xs.filter((p) => p.rating === "good").length / xs.length) * 100)}%</td>
                    <td>{xs.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!vitals.data?.length && <p className="small muted">Замеров пока нет: они появятся, когда она откроет приложение после обновления.</p>}
        </div>
        <b>Ошибки сервера</b>
        {(errors.data ?? []).length ? (
          <div className="stack" style={{ gap: 6 }}>
            {(errors.data ?? []).map((e, i) => (
              <div key={i} className="small" style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
                <span className="muted num">{fmtTime.format(new Date(e.created_at))}</span>
                <span style={{ overflowWrap: "anywhere" }}>
                  <b>{e.path}</b> <span className="muted">{e.message}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="small muted">{errors.error ? "Таблица ошибок ещё не создана (миграция 0008)." : "Ошибок не было."}</p>
        )}
      </section>
    </>
  );
}

function summarizeProps(p: Record<string, unknown>) {
  const keys = ["term", "answer", "scenario", "goalsDone", "page", "variant", "dueCount"];
  return keys
    .filter((k) => p?.[k] != null)
    .map((k) => `${k}: ${Array.isArray(p[k]) ? (p[k] as unknown[]).length : String(p[k]).slice(0, 40)}`)
    .join(" · ");
}
