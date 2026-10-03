import { SettingsForm } from "@/components/SettingsForm";
import { requireSession } from "@/lib/session";

export default async function SettingsPage() {
  const s = await requireSession();
  return (
    <>
      <h1 className="display">Настройки</h1>
      <SettingsForm
        initial={{
          display_name: s.profile.display_name,
          ui_lang: s.profile.ui_lang,
          levels: s.profile.levels,
          tts_rate: Number(s.profile.settings?.tts_rate ?? 0.9),
        }}
      />
    </>
  );
}
