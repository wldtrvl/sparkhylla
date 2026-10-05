import { UpdateLink, UpdatesSeen } from "@/components/UpdatesSeen";
import { requireSession } from "@/lib/session";
import { asUpdateKind, UPDATE_KIND_LABEL, updatesSeenAt } from "@/lib/updates";

const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" });

export default async function UpdatesPage() {
  const s = await requireSession();
  const seen = updatesSeenAt(s.profile);
  const { data, error } = await s.supabase.from("app_updates").select("id,published_at,kind,title,body,link").order("published_at", { ascending: false }).limit(200);
  const items = data ?? [];
  const isNew = (at: string) => !seen || at > seen;
  const unseen = items.filter((u) => isNew(u.published_at)).length;

  // group by day in Oslo time, newest first
  const days: { key: string; label: string; items: typeof items }[] = [];
  for (const u of items) {
    const d = new Date(u.published_at);
    const key = dayKey.format(d);
    if (days.at(-1)?.key !== key) days.push({ key, label: fmtDay.format(d), items: [] });
    days.at(-1)!.items.push(u);
  }

  return (
    <>
      <div className="stack gap-4">
        <span className="eyebrow">Språkhylla</span>
        <h1 className="display">Что нового</h1>
        <p className="lead">Новые тексты и возможности приложения, по дням.{unseen ? ` Новое с прошлого раза: ${unseen}.` : ""}</p>
      </div>
      <UpdatesSeen latest={items[0]?.published_at ?? null} unseen={unseen} />
      {error && <p className="small muted">Список пока недоступен. Попробуйте позже.</p>}
      {days.map((day) => (
        <section key={day.key} className="stack" style={{ gap: 12 }}>
          <h2 className="eyebrow">{day.label}</h2>
          {day.items.map((u) => {
            const kind = asUpdateKind(u.kind);
            return (
              <article key={u.id} className={`card update-card${isNew(u.published_at) ? " is-new" : ""}`}>
                <div className="row" style={{ gap: 8 }}>
                  <span className={kind === "content" ? "chip brass" : kind === "fix" ? "chip" : "chip ok"}>{UPDATE_KIND_LABEL[kind]}</span>
                  {isNew(u.published_at) && <span className="chip new-chip">новое</span>}
                </div>
                <h3 className="h2">{u.title}</h3>
                {u.body && <p style={{ margin: 0 }}>{u.body}</p>}
                {u.link && (
                  <div>
                    <UpdateLink id={u.id} href={u.link}>
                      Открыть →
                    </UpdateLink>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
