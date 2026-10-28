import Link from "next/link";
import { GrammarTabs } from "@/components/GrammarTabs";
import { GRAMMAR } from "@/lib/learning/grammar";
import { patternOf, sentenceOf } from "@/lib/learning/sentences";
import { requireSession } from "@/lib/session";
import { htmlLang } from "@/lib/text-format";

/** «Мои заметки»: the rules and sentence patterns she kept, with her own comments, newest first. */
export default async function NotesPage() {
  const s = await requireSession();
  const lang = s.profile.active_lang;
  const { data } = await s.supabase.from("notes").select("kind,ref,body,updated_at").eq("user_id", s.user.id).eq("lang", lang).order("updated_at", { ascending: false });
  const notes = data ?? [];
  return (
    <>
      <div className="stack gap-8">
        <h1 className="display">Мои заметки</h1>
        <p className="lead">Правила и схемы предложений, к которым хочется вернуться. Добавляйте их кнопкой «☆ В мои заметки» и пишите свои подсказки.</p>
      </div>
      <GrammarTabs active="notes" />
      {!notes.length && <p className="muted">Пока пусто. Откройте правило или заметку «Как строить предложения» и сохраните то, что важно для вас.</p>}
      <div className="grid">
        {notes.map((n) => {
          const rule = n.kind === "rule" ? GRAMMAR.find((g) => g.key === n.ref) : undefined;
          const pattern = n.kind === "pattern" ? patternOf(n.ref) : undefined;
          if (!rule && !pattern) return null;
          return (
            <Link key={`${n.kind}:${n.ref}`} href={rule ? `/grammar/${n.ref}` : `/grammar/build/${n.ref}`} className="card grammar-card">
              <span className="eyebrow">{rule ? "Правило" : "Как строить"}</span>
              <b style={{ fontSize: 18 }}>{rule?.title ?? pattern?.title}</b>
              <span className="small muted read-sentence" lang={htmlLang(lang)}>
                {rule ? rule.examples[0]?.[0] : pattern ? sentenceOf(pattern.variations[0]) : ""}
              </span>
              {n.body && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>}
            </Link>
          );
        })}
      </div>
    </>
  );
}
