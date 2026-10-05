"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { track } from "./tracker";

const ICONS: Record<string, React.ReactNode> = {
  desk: <path d="M3 10h18M5 10v9M19 10v9M8 6h8l2 4H6z" />,
  path: (
    <>
      <path d="M5 21V4M5 4h11l-2 3.5L16 11H5" />
    </>
  ),
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
  updates: (
    <>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
};

const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);

/** Number of «Что нового» entries she has not opened yet. */
const NewBadge = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="nav-badge" aria-label={`новое: ${n}`}>
      {n}
    </span>
  ) : null;

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

export function Sidebar({ activeLang, isCoach, levels, newUpdates }: { activeLang: "no" | "en"; isCoach: boolean; levels: string; newUpdates: number }) {
  const path = usePathname();
  const { pending, switchLang } = useLangSwitch(activeLang, "sidebar");
  // On a phone the bottom bar shows the four daily sections (short labels); the rest sit under «Ещё».
  const items = [
    { href: "/", label: "Мой стол", short: "Стол", icon: "desk", primary: true },
    { href: "/path", label: "Мой путь", short: "Путь", icon: "path", primary: true },
    { href: "/library", label: "Библиотека", short: "Книги", icon: "library", primary: true },
    { href: "/words", label: "Мои слова", short: "Слова", icon: "words", primary: true },
    { href: "/talk", label: "Разговор", short: "Разговор", icon: "talk", primary: false },
    { href: "/grammar", label: "Грамматика", short: "Грамматика", icon: "grammar", primary: false },
    { href: "/updates", label: "Что нового", short: "Что нового", icon: "updates", primary: false },
    ...(isCoach ? [{ href: "/coach", label: "Помощник", short: "Помощник", icon: "coach", primary: false }] : []),
  ];
  const more = [...items.filter((it) => !it.primary), { href: "/settings", label: "Настройки", short: "Настройки", icon: "settings", primary: false }];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.some((it) => isActive(it.href));

  // close the «Ещё» sheet on Escape (links in it close it themselves)
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <b>Språkhylla</b>
        <span>домашняя языковая библиотека</span>
      </Link>
      <nav className="nav" aria-label="Разделы">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={it.primary ? undefined : "nav-secondary"} aria-current={isActive(it.href) ? "page" : undefined}>
            <Icon name={it.icon} />
            <span className="lbl-long">{it.label}</span>
            <span className="lbl-short">{it.short}</span>
            {it.href === "/updates" && <NewBadge n={newUpdates} />}
          </Link>
        ))}
        <button
          type="button"
          className="nav-more"
          aria-expanded={moreOpen}
          aria-controls="nav-more-sheet"
          aria-current={moreActive ? "page" : undefined}
          onClick={() => {
            if (!moreOpen) track("nav.more_open", { path });
            setMoreOpen(!moreOpen);
          }}
        >
          <Icon name="more" />
          <span>Ещё</span>
          {newUpdates > 0 && <span className="nav-dot" aria-label="есть новое" />}
        </button>
      </nav>
      {moreOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div id="nav-more-sheet" className="more-sheet" role="dialog" aria-label="Другие разделы">
            {more.map((it) => (
              <Link key={it.href} href={it.href} aria-current={isActive(it.href) ? "page" : undefined} onClick={() => setMoreOpen(false)}>
                <Icon name={it.icon} />
                {it.label}
                {it.href === "/updates" && <NewBadge n={newUpdates} />}
              </Link>
            ))}
          </div>
        </>
      )}
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
