"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
type Skills = { reading: string; speaking: string; writing: string };

export function SettingsForm({ initial }: { initial: { display_name: string; ui_lang: "ru" | "uk"; levels: Record<"no" | "en", Skills>; tts_rate: number } }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: v.display_name, ui_lang: v.ui_lang, levels: v.levels, settings: { tts_rate: v.tts_rate } }),
    });
    setState(r.ok ? "saved" : "error");
    router.refresh();
  }

  const setLevel = (lang: "no" | "en", skill: keyof Skills, val: string) => setV((x) => ({ ...x, levels: { ...x.levels, [lang]: { ...x.levels[lang], [skill]: val } } }));

  return (
    <form className="split" onSubmit={save}>
      <div className="wide card" style={{ gap: 18 }}>
        <div className="field">
          <label htmlFor="name">Как к вам обращаться</label>
          <input id="name" className="input" value={v.display_name} onChange={(e) => setV({ ...v, display_name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ui">Язык объяснений</label>
          <select id="ui" className="input" value={v.ui_lang} onChange={(e) => setV({ ...v, ui_lang: e.target.value as "ru" | "uk" })}>
            <option value="ru">Русский</option>
            <option value="uk">Українська</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rate">Скорость озвучки</label>
          <select id="rate" className="input" value={v.tts_rate} onChange={(e) => setV({ ...v, tts_rate: Number(e.target.value) })}>
            <option value={0.75}>Медленно</option>
            <option value={0.9}>Спокойно</option>
            <option value={1}>Обычно</option>
          </select>
        </div>
        {(["no", "en"] as const).map((lang) => (
          <fieldset key={lang} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>{lang === "no" ? "Норвежский" : "Английский"}</legend>
            {(["reading", "speaking", "writing"] as const).map((sk) => (
              <div key={sk} className="field">
                <label htmlFor={`${lang}-${sk}`}>{sk === "reading" ? "Чтение" : sk === "speaking" ? "Речь" : "Письмо"}</label>
                <select id={`${lang}-${sk}`} className="input" value={v.levels[lang][sk]} onChange={(e) => setLevel(lang, sk, e.target.value)}>
                  {LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
        ))}
        <div className="row">
          <button className="btn" type="submit" disabled={state === "saving"}>
            {state === "saving" ? "Сохраняю…" : "Сохранить"}
          </button>
          {state === "saved" && <span className="chip ok">Сохранено</span>}
          {state === "error" && <span className="error">Не удалось сохранить. Попробуйте ещё раз.</span>}
        </div>
      </div>
      <div className="side">
        <div className="card">
          <b>Уровень чтения</b>
          <p className="small muted" style={{ lineHeight: 1.55 }}>
            От него зависит, какие книги библиотека считает подходящими. Если тексты кажутся слишком трудными — понизьте уровень; слишком лёгкими — повысьте.
          </p>
        </div>
        <button
          type="button"
          className="btn soft"
          onClick={async () => {
            await createClient().auth.signOut();
            router.replace("/login");
          }}
        >
          Выйти
        </button>
      </div>
    </form>
  );
}
