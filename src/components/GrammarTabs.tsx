import Link from "next/link";

const TABS = [
  { key: "rules", href: "/grammar", label: "Правила" },
  { key: "build", href: "/grammar/build", label: "Как строить предложения" },
  { key: "notes", href: "/grammar/notes", label: "Мои заметки" },
] as const;

export function GrammarTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  const on = { borderColor: "var(--cloth)", background: "var(--cloth-soft)" };
  return (
    <nav className="chips" aria-label="Разделы грамматики">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className="btn soft small" aria-current={active === t.key ? "page" : undefined} style={active === t.key ? on : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
