import Link from "next/link";
import { notFound } from "next/navigation";
import { FixCard } from "@/components/FixCard";
import type { Feedback } from "@/lib/ai/prompts";
import { requireSession } from "@/lib/session";

export default async function ReviewTalk({ params }: PageProps<"/talk/review/[id]">) {
  const s = await requireSession();
  const { id } = await params;
  const { data: conv } = await s.supabase.from("conversations").select("id,scenario_id,lang,goals_done,started_at,ended_at,summary").eq("id", id).eq("user_id", s.user.id).maybeSingle();
  if (!conv) notFound();
  const [{ data: sc }, { data: fixes }, { data: turns }] = await Promise.all([
    s.supabase.from("scenarios").select("title_ru,goals").eq("id", conv.scenario_id).single(),
    s.supabase.from("feedback_items").select("id,said,hint,correction,rule_label,status").eq("conversation_id", id).order("id"),
    s.supabase.from("conversation_turns").select("role,text").eq("conversation_id", id).order("id"),
  ]);
  const fb = conv.summary as Feedback | null;
  const minutes = conv.ended_at ? Math.max(1, Math.round((Date.parse(conv.ended_at) - Date.parse(conv.started_at)) / 60000)) : null;
  const langAttr = conv.lang === "no" ? "nb" : "en";

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">
          Разговор завершён{minutes ? ` · ${minutes} мин` : ""} · {sc?.title_ru}
        </span>
        <h1 className="display" style={{ fontSize: "clamp(30px,3.4vw,42px)" }}>
          Цели: {conv.goals_done.length} из {(sc?.goals as unknown[] | undefined)?.length ?? "?"}
        </h1>
        {fb?.summary && <p className="lead">{fb.summary}</p>}
      </div>
      <div className="split">
        <div className="wide stack" style={{ gap: 16 }}>
          {!!fb?.wins?.length && (
            <div className="card" style={{ background: "var(--ok-soft)", border: 0 }}>
              <b>Что получилось</b>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {fb.wins.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {!!fixes?.length && <h2 className="h2">Что стоит поправить</h2>}
          {(fixes ?? []).map((f) => (
            <FixCard key={f.id} item={f} lang={conv.lang} />
          ))}
          {!!fb?.new_phrases?.length && (
            <div className="card">
              <b>Новые фразы — уже в «Моих словах»</b>
              <div className="chips">
                {fb.new_phrases.map((p) => (
                  <span key={p.term} className="chip" style={{ background: "var(--oxblood-soft)", fontWeight: 500 }} title={p.translation}>
                    <span lang={langAttr}>{p.term}</span> — {p.translation}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <Link className="btn ghost" href={`/talk/${conv.scenario_id}`}>
              Поговорить ещё раз
            </Link>
            <Link className="btn" href="/">
              Готово
            </Link>
          </div>
        </div>
        <aside className="side">
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Весь разговор</summary>
            {(turns ?? []).map((t, i) => (
              <p key={i} lang={langAttr} style={{ fontFamily: "var(--f-read)" }}>
                <b className="small muted">{t.role === "tutor" ? "Собеседник" : "Вы"}:</b> {t.text}
              </p>
            ))}
          </details>
        </aside>
      </div>
    </>
  );
}
