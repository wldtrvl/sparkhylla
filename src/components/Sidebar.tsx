"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { track } from "./tracker";

const ICONS: Record<string, React.ReactNode> = {
  desk: <path d="M3 10h18M5 10v9M19 10v9M8 6h8l2 4H6z" />,
  library: (
    <>
      <path d="M4 19V5M8 19V5M12 19l3-14 4 1-3 14" />
      <path d="M3 19h18" />
    </>
  ),
  talk: (
    <>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  words: (
    <>
      <rect x="4" y="3" width="13" height="16" rx="2" />
      <path d="M8 21h11a1 1 0 0 0 1-1V7M8 8h5M8 12h5" />
    </>
  ),
  grammar: (
    <>
      <circle cx="5" cy="18" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="19" cy="15" r="2" />
      <path d="M6.2 16.4l4.6-8.8M13.4 7.5l4.4 5.8" />
    </>
  ),
  coach: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
};

/** Switch the active language (Norsk/English); shared by the sidebar and the phone top bar. */
function useLangSwitch(activeLang: "no" | "en", where: "sidebar" | "mobile") {
  const router = useRouter();
  const [pending, start] = useTransition();
  function switchLang(lang: "no" | "en") {
    if (lang === activeLang) return;
    track("settings.lang_switch", { from: activeLang, to: lang, where });
    start(async () => {
      await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active_lang: lang }) });
      router.refresh();
    });
  }
  return { pending, switchLang };
}

export function Sidebar({ activeLang, isCoach, levels }: { activeLang: "no" | "en"; isCoach: boolean; levels: string }) {
  const path = usePathname();
  const { pending, switchLang } = useLangSwitch(activeLang, "sidebar");
  const items = [
    { href: "/", label: "Мой стол", icon: "desk" },
    { href: "/library", label: "Библиотека", icon: "library" },
    { href: "/talk", label: "Разговор", icon: "talk" },
    { href: "/words", label: "Мои слова", icon: "words" },
    { href: "/grammar", label: "Грамматика", icon: "grammar" },
    ...(isCoach ? [{ href: "/coach", label: "Помощник", icon: "coach" }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <b>Språkhylla</b>
        <span>домашняя языковая библиотека</span>
      </Link>
      <nav className="nav" aria-label="Разделы">
        {items.map((it) => (
          <Link key={it.href} href={it.href} aria-current={isActive(it.href) ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[it.icon]}
            </svg>
            {it.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="langswitch" aria-busy={pending}>
          <button type="button" aria-pressed={activeLang === "no"} onClick={() => switchLang("no")}>
            Norsk
          </button>
          <button type="button" aria-pressed={activeLang === "en"} onClick={() => switchLang("en")}>
            English
          </button>
        </div>
        <span style={{ opacity: 0.8 }}>{levels}</span>
        <Link href="/settings" style={{ color: "inherit", opacity: 0.8 }}>
          Настройки
        </Link>
      </div>
    </aside>
  );
}

/** Phone top bar: the sidebar footer is hidden below 860 px, so language and settings live here. */
export function MobileLangSwitch({ activeLang }: { activeLang: "no" | "en" }) {
  const { pending, switchLang } = useLangSwitch(activeLang, "mobile");
  return (
    <div className="mobile-top">
      <b style={{ fontFamily: "var(--f-display)", fontSize: 26 }}>Språkhylla</b>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <div className="langswitch" style={{ background: "var(--cloth)" }} aria-busy={pending}>
          {(["no", "en"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={activeLang === l} onClick={() => switchLang(l)} style={{ padding: "6px 12px" }}>
              {l === "no" ? "Norsk" : "English"}
            </button>
          ))}
        </div>
        <Link href="/settings" className="icon-btn" aria-label="Настройки">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
