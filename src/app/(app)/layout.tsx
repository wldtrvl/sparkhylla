import { MobileLangSwitch, Sidebar } from "@/components/Sidebar";
import { Tracker } from "@/components/tracker";
import { requireSession } from "@/lib/session";
import { unseenUpdates } from "@/lib/updates";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ profile }, updates] = await Promise.all([requireSession(), unseenUpdates()]);
  const lv = profile.levels;
  const levels = profile.active_lang === "no" ? `Norsk: чтение ${lv.no?.reading}, речь ${lv.no?.speaking}` : `English: чтение ${lv.en?.reading}, речь ${lv.en?.speaking}`;
  return (
    <div className="shell">
      <Sidebar activeLang={profile.active_lang} isCoach={profile.role === "coach"} levels={levels} newUpdates={updates.count} />
      <main className="main">
        <div className="container">
          <MobileLangSwitch activeLang={profile.active_lang} />
          {children}
        </div>
      </main>
      <Tracker />
    </div>
  );
}
