import { notFound } from "next/navigation";
import { Conversation } from "@/components/Conversation";
import { requireSession } from "@/lib/session";
import { sttAvailable } from "@/lib/speech/stt";

export default async function TalkPage({ params }: PageProps<"/talk/[scenario]">) {
  const s = await requireSession();
  const { scenario } = await params;
  const { data: sc } = await s.supabase.from("scenarios").select("id,title_ru,lang,level,persona,goals").eq("id", scenario).maybeSingle();
  if (!sc) notFound();
  return (
    <Conversation
      scenario={{ id: sc.id, title: sc.title_ru, lang: sc.lang, level: s.profile.levels[sc.lang as "no" | "en"]?.speaking ?? sc.level, persona: sc.persona, goals: sc.goals }}
      serverStt={sttAvailable()}
    />
  );
}
