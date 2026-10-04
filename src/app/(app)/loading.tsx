/** Shown instantly while a page's data loads (the sidebar stays in place). */
export default function Loading() {
  return (
    <div className="stack" style={{ gap: 24 }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Загружаю…</span>
      <div className="skeleton" style={{ height: 44, width: "min(420px, 80%)" }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="grid">
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    </div>
  );
}
