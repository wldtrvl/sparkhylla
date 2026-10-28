import { asGoals, asLang } from "@/lib/db-json";
import { notFound } from "next/navigation";
import { Conversation } from "@/components/Conversation";
import { getPack, packTalkGoal } from "@/lib/packs-data";
import { requireSession } from "@/lib/session";
import { sttAvailable } from "@/lib/speech/stt";

export default async function TalkPage({ params, searchParams }: PageProps<"/talk/[scenario]">) {
  const s = await requireSession();
  const { scenario } = await params;
  const sp = await searchParams;
  const { data: sc } = await s.supabase.from("scenarios").select("id,title_ru,lang,level,persona,goals").eq("id", scenario).maybeSingle();
  if (!sc) notFound();
  // from «Набор дня»: the same extra goal the server adds when the conversation starts
  const pack = typeof sp.pack === "string" ? await getPack(s, sp.pack) : null;
  const ofPack = pack && pack.status === "active" && pack.plan.talk?.scenarioId === sc.id ? pack : null;
  const extra = ofPack ? await packTalkGoal(s, ofPack) : null;
  return (
    <Conversation
      scenario={{ id: sc.id, title: sc.title_ru, lang: asLang(sc.lang), level: s.profile.levels[asLang(sc.lang)]?.speaking ?? sc.level, persona: sc.persona, goals: [...asGoals(sc.goals), ...(extra ? [extra] : [])] }}
      serverStt={sttAvailable()}
      packId={ofPack?.id}
    />
  );
}
